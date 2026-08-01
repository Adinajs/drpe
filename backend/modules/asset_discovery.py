# backend/modules/asset_discovery.py
# =============================================================
# Asset Discovery Engine using python-nmap
# =============================================================
import nmap
import asyncio
import structlog
import os
import subprocess
from datetime import datetime, timezone
from typing import List, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from models import Asset, AssetCriticality, AssetStatus
from config import settings

logger = structlog.get_logger()


class AssetDiscoveryEngine:
    """
    Runs Nmap against a CIDR range, parses results,
    and upserts discovered hosts into PostgreSQL.
    """

    CRITICALITY_KEYWORDS = {
        AssetCriticality.critical: ["domain", "dc", "ad", "exchange", "firewall", "router", "gateway"],
        AssetCriticality.high:     ["web", "http", "nginx", "apache", "sql", "db", "database", "smb"],
        AssetCriticality.medium:   ["ftp", "ssh", "rdp", "vnc", "telnet"],
        AssetCriticality.low:      [],
    }

    def __init__(self):
        try:
            self.nm = nmap.PortScanner()
            logger.info("Asset Discovery Engine: Nmap initialized")
        except nmap.PortScannerError:
            logger.error("Nmap not found in system path")
            self.nm = None
        except Exception as e:
            logger.error("Unexpected error during Nmap init", error=str(e))
            self.nm = None

    def _infer_criticality(self, services: List[str], hostname: str | None) -> AssetCriticality:
        """Guess asset criticality based on detected services & hostname."""
        text = " ".join(services + ([hostname] if hostname else [])).lower()
        for level, keywords in self.CRITICALITY_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return level
        return AssetCriticality.medium

    def _parse_host(self, host: str, host_data: Dict) -> Dict[str, Any]:
        """Extract structured data from a single nmap host entry."""
        ports = []
        services_detected = []

        for proto in host_data.all_protocols():
            for port_num in sorted(host_data[proto].keys()):
                port_info = host_data[proto][port_num]
                if port_info["state"] == "open":
                    svc = {
                        "port":     port_num,
                        "protocol": proto,
                        "service":  port_info.get("name", ""),
                        "version":  port_info.get("version", ""),
                        "product":  port_info.get("product", ""),
                    }
                    ports.append(svc)
                    services_detected.append(
                        f"{port_info.get('name', '')} {port_info.get('product', '')}"
                    )

        hostname = None
        if host_data.hostname():
            hostname = host_data.hostname()

        os_match = None
        if "osmatch" in host_data and host_data["osmatch"]:
            os_match = host_data["osmatch"][0].get("name")

        mac = None
        if "mac" in host_data.get("addresses", {}):
            mac = host_data["addresses"]["mac"]

        criticality = self._infer_criticality(services_detected, hostname)

        return {
            "ip_address":   host,
            "hostname":     hostname,
            "mac_address":  mac,
            "os_detected":  os_match,
            "open_ports":   ports,
            "criticality":  criticality,
        }

    async def scan_network(
        self,
        target: str | None = None,
        flags: str | None = None,
    ) -> List[Dict[str, Any]]:
        """
        Run Nmap scan (blocking call offloaded to thread pool).
        Returns list of parsed host dicts.
        """
        if self.nm is None:
            raise RuntimeError("Nmap Intelligence Module is not initialized. Please install Nmap and add it to your PATH.")

        target = target or settings.SCAN_NETWORK_RANGE
        flags  = flags  or settings.NMAP_FLAGS

        logger.info("Starting Nmap scan", target=target, flags=flags)

        loop = asyncio.get_event_loop()
        try:
            await loop.run_in_executor(None, self._run_nmap, target, flags)
        except Exception as e:
            logger.error("Nmap scan failed", error=str(e))
            if "privileges" in str(e).lower():
                raise RuntimeError("Nmap requires elevated privileges (Root/Admin) for this scan type. Try a simpler scan (e.g., -sV).")
            raise RuntimeError(f"Nmap reconnaissance failed: {str(e)}")

        results = []
        for host in self.nm.all_hosts():
            if self.nm[host].state() == "up":
                try:
                    parsed = self._parse_host(host, self.nm[host])
                    results.append(parsed)
                    logger.info("Discovered host", ip=host, ports=len(parsed["open_ports"]))
                except Exception as parse_err:
                    logger.warning("Failed to parse host data", ip=host, error=str(parse_err))

        logger.info("Nmap scan complete", total_hosts=len(results))
        return results

    def _run_nmap(self, target: str, flags: str):
        """Blocking nmap call – run inside executor."""
        # Force the path if specified in settings
        if settings.NMAP_PATH and os.path.exists(settings.NMAP_PATH):
            # This is a bit of a hack as python-nmap doesn't explicitly support setting the path 
            # after init, but normally it just calls 'nmap' from shell.
            # If settings.NMAP_PATH is set, we ensure the env path is updated for this process.
            os.environ["PATH"] += os.pathsep + settings.NMAP_PATH
            
        self.nm.scan(hosts=target, arguments=flags)

    async def persist_assets(
        self,
        db: AsyncSession,
        discovered: List[Dict[str, Any]],
    ) -> Dict[str, int]:
        """Upsert discovered hosts into assets table using bulk operations. Returns counts."""
        new_count = 0
        updated_count = 0
        now = datetime.now(timezone.utc)

        # 1. Bulk fetch existing assets for matching IPs
        ips = [str(host_data["ip_address"]) for host_data in discovered]
        result = await db.execute(
            select(Asset).where(Asset.ip_address.in_(ips))
        )
        existing_map = {str(a.ip_address): a for a in result.scalars().all()}

        # 2. Process each discovered host
        for host_data in discovered:
            ip = str(host_data["ip_address"])
            existing = existing_map.get(ip)

            if existing:
                # Update existing asset
                existing.last_seen   = now
                existing.status      = AssetStatus.active
                if host_data["hostname"]:    existing.hostname    = host_data["hostname"]
                if host_data["os_detected"]: existing.os_detected = host_data["os_detected"]
                if host_data["open_ports"]:  existing.open_ports  = host_data["open_ports"]
                if host_data["mac_address"]: existing.mac_address = host_data["mac_address"]
                updated_count += 1
            else:
                # Create new asset
                asset = Asset(
                    ip_address   = ip,
                    hostname     = host_data["hostname"],
                    mac_address  = host_data["mac_address"],
                    os_detected  = host_data["os_detected"],
                    open_ports   = host_data["open_ports"],
                    criticality  = host_data["criticality"],
                    status       = AssetStatus.active,
                    first_seen   = now,
                    last_seen    = now,
                )
                db.add(asset)
                
                # New Asset Notification
                from models import ActivityLog
                db.add(ActivityLog(
                    title=f"New Asset Identified: {ip}",
                    details=f"Intelligence module successfully fingerprinted a new tactical node ({host_data['hostname'] or 'Unknown'}). Criticality: {asset.criticality.value}.",
                    type="success"
                ))
                new_count += 1

        await db.flush()
        logger.info("Assets persisted (Optimized Bulk)", new=new_count, updated=updated_count)
        return {"new": new_count, "updated": updated_count, "total": new_count + updated_count}


# Singleton
discovery_engine = AssetDiscoveryEngine()
