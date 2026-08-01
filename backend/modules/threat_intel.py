# backend/modules/threat_intel.py
# =============================================================
# Threat Intelligence Integration
# Sources: AlienVault OTX + AbuseIPDB
# =============================================================
import httpx
import asyncio
import structlog
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from tenacity import retry, stop_after_attempt, wait_exponential

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from modules.misp_intel import misp_service
from models import Asset, ThreatIntel
from config import settings

logger = structlog.get_logger()

OTX_BASE     = "https://otx.alienvault.com/api/v1"
ABUSE_BASE   = "https://api.abuseipdb.com/api/v2"


class OTXClient:
    """AlienVault OTX threat intelligence."""

    def __init__(self, api_key: str):
        self.headers = {"X-OTX-API-KEY": api_key}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def get_ip_reputation(self, ip: str) -> Dict[str, Any]:
        """Fetch general reputation for an IP from OTX."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{OTX_BASE}/indicators/IPv4/{ip}/general",
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def get_ip_malware(self, ip: str) -> Dict[str, Any]:
        """Fetch malware associated with an IP."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{OTX_BASE}/indicators/IPv4/{ip}/malware",
                headers=self.headers,
            )
            resp.raise_for_status()
            return resp.json()

    def extract_intel(self, general: Dict, malware: Dict) -> Dict[str, Any]:
        """Normalize OTX API response into our schema fields."""
        pulse_info   = general.get("pulse_info", {})
        pulse_count  = pulse_info.get("count", 0)
        malware_count = len(malware.get("data", []))

        tags       = []
        adversaries = []
        pulse_names = []

        for pulse in pulse_info.get("pulses", []):
            pulse_names.append(pulse.get("name", ""))
            tags.extend(pulse.get("tags", []))
            adversaries.extend(pulse.get("adversary", []) if isinstance(pulse.get("adversary"), list)
                                else ([pulse["adversary"]] if pulse.get("adversary") else []))

        # OTX threat score: pulse_count (max contribution ~50) + malware presence (~50)
        otx_score = min(pulse_count * 5, 50) + min(malware_count * 10, 50)
        otx_score = min(otx_score, 100)

        return {
            "otx_pulse_count":  pulse_count,
            "otx_malware_count": malware_count,
            "otx_threat_score": float(otx_score),
            "otx_tags":         list(set(tags))[:20],
            "otx_adversaries":  list(set(adversaries))[:10],
            "otx_pulse_names":  pulse_names[:10],
        }


class AbuseIPDBClient:
    """AbuseIPDB IP reputation checking."""

    def __init__(self, api_key: str):
        self.headers = {
            "Key":    api_key,
            "Accept": "application/json",
        }

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def check_ip(self, ip: str, max_age_days: int = 90) -> Dict[str, Any]:
        """Check IP reputation against AbuseIPDB."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{ABUSE_BASE}/check",
                headers=self.headers,
                params={"ipAddress": ip, "maxAgeInDays": max_age_days, "verbose": False},
            )
            resp.raise_for_status()
            return resp.json()

    def extract_intel(self, response: Dict) -> Dict[str, Any]:
        data = response.get("data", {})
        last_reported = data.get("lastReportedAt")
        if last_reported and isinstance(last_reported, str):
            try:
                last_reported = datetime.fromisoformat(last_reported.replace("Z", "+00:00"))
            except Exception:
                pass

        return {
            "abuse_confidence":    data.get("abuseConfidenceScore", 0),
            "abuse_total_reports": data.get("totalReports", 0),
            "abuse_last_reported": last_reported,
            "abuse_country_code":  data.get("countryCode"),
            "abuse_isp":           data.get("isp"),
            "abuse_is_public":     data.get("isPublic"),
            "abuse_is_tor":        data.get("isTor", False),
        }


class ThreatIntelService:
    """
    Aggregates OTX + AbuseIPDB results and calculates
    composite threat score for each asset IP.
    """

    def __init__(self):
        self.otx   = OTXClient(settings.OTX_API_KEY)   if settings.OTX_API_KEY   else None
        self.abuse = AbuseIPDBClient(settings.ABUSEIPDB_API_KEY) if settings.ABUSEIPDB_API_KEY else None

    def _compute_composite_score(
        self,
        otx_score: float,
        abuse_confidence: int,
        otx_pulse_count: int,
        misp_match: bool = False,
        exploit_count: int = 0,
    ) -> float:
        """
        Composite threat score (0-100):
        - 40% weight: AbuseIPDB confidence
        - 25% weight: OTX score
        - 15% weight: pulse presence bonus
        - 20% weight: MISP match bonus
        """
        abuse_component = abuse_confidence * 0.40
        otx_component   = otx_score       * 0.25
        pulse_bonus     = min(otx_pulse_count * 2, 15)  # up to 15 points
        misp_bonus      = 20.0 if misp_match else 0.0
        score = abuse_component + otx_component + pulse_bonus + misp_bonus
        return min(round(score, 2), 100.0)

    async def fetch_intel_for_ip(self, ip: str) -> Dict[str, Any]:
        """Gather all threat data for a single IP asynchronously."""
        intel: Dict[str, Any] = {"ip_address": ip}

        # Run both checks concurrently
        otx_general_task = otx_malware_task = abuse_task = None

        if self.otx:
            otx_general_task = asyncio.create_task(self.otx.get_ip_reputation(ip))
            otx_malware_task = asyncio.create_task(self.otx.get_ip_malware(ip))
        if self.abuse:
            abuse_task = asyncio.create_task(self.abuse.check_ip(ip))

        misp_task = asyncio.create_task(misp_service.check_ip(ip))

        # Collect OTX
        otx_data = {}
        if otx_general_task:
            try:
                general = await otx_general_task
                malware = await otx_malware_task if otx_malware_task else {}
                otx_data = self.otx.extract_intel(general, malware)
                intel["raw_otx_response"] = general
            except Exception as e:
                logger.warning("OTX fetch failed", ip=ip, error=str(e))
                otx_data = {
                    "otx_pulse_count": 0, "otx_malware_count": 0,
                    "otx_threat_score": 0, "otx_tags": [], "otx_adversaries": [], "otx_pulse_names": [],
                }

        # Collect AbuseIPDB
        abuse_data = {}
        if abuse_task:
            try:
                abuse_resp = await abuse_task
                abuse_data = self.abuse.extract_intel(abuse_resp)
                intel["raw_abuse_response"] = abuse_resp
            except Exception as e:
                logger.warning("AbuseIPDB fetch failed", ip=ip, error=str(e))
                abuse_data = {
                    "abuse_confidence": 0, "abuse_total_reports": 0,
                    "abuse_last_reported": None, "abuse_country_code": None,
                    "abuse_isp": None, "abuse_is_public": None, "abuse_is_tor": False,
                }

        intel.update(otx_data)
        intel.update(abuse_data)

        # Collect MISP
        misp_data = await misp_task
        intel.update(misp_data)

        # Composite score
        intel["composite_threat_score"] = self._compute_composite_score(
            otx_score        = otx_data.get("otx_threat_score", 0),
            abuse_confidence = abuse_data.get("abuse_confidence", 0),
            otx_pulse_count  = otx_data.get("otx_pulse_count", 0),
            misp_match       = misp_data.get("misp_match", False),
        )

        intel["fetched_at"] = datetime.now(timezone.utc)
        return intel

    async def fetch_and_store_for_all_assets(
        self,
        db: AsyncSession,
        asset_ips: List[str] | None = None,
    ) -> Dict[str, int]:
        """Fetch threat intel for all (or specified) active assets."""
        if asset_ips is None:
            result = await db.execute(
                select(Asset).where(Asset.status == "active")
            )
            assets = result.scalars().all()
            asset_ips = [str(a.ip_address) for a in assets]

        if not asset_ips:
            logger.info("No active assets found for threat intel sync")
            return {"processed": 0, "total": 0, "message": "No active assets found for synchronization."}

        # Build ip → asset_id map
        result = await db.execute(select(Asset).where(Asset.ip_address.in_(asset_ips)))
        asset_map: Dict[str, Any] = {str(a.ip_address): a for a in result.scalars().all()}

        success_count = 0
        for ip in asset_ips:
            if ip not in asset_map:
                logger.warning("Asset not found in DB", ip=ip)
                continue
            try:
                intel = await self.fetch_intel_for_ip(ip)
                ti = ThreatIntel(
                    asset_id                = asset_map[ip].id,
                    ip_address              = ip,
                    abuse_confidence        = intel.get("abuse_confidence"),
                    abuse_total_reports     = intel.get("abuse_total_reports", 0),
                    abuse_country_code      = intel.get("abuse_country_code"),
                    abuse_isp               = intel.get("abuse_isp"),
                    abuse_is_public         = intel.get("abuse_is_public"),
                    abuse_is_tor            = intel.get("abuse_is_tor", False),
                    otx_pulse_count         = intel.get("otx_pulse_count", 0),
                    otx_malware_count       = intel.get("otx_malware_count", 0),
                    otx_threat_score        = intel.get("otx_threat_score", 0),
                    otx_tags                = intel.get("otx_tags", []),
                    otx_adversaries         = intel.get("otx_adversaries", []),
                    otx_pulse_names         = intel.get("otx_pulse_names", []),
                    composite_threat_score  = intel.get("composite_threat_score", 0),
                    raw_otx_response        = intel.get("raw_otx_response"),
                    raw_abuse_response      = intel.get("raw_abuse_response"),
                    fetched_at              = intel.get("fetched_at"),
                )
                db.add(ti)
                success_count += 1
                logger.info("Threat intel stored", ip=ip, score=intel.get("composite_threat_score"))
                # Avoid rate-limiting
                await asyncio.sleep(0.5)
            except Exception as e:
                logger.error("Failed to fetch/store threat intel", ip=ip, error=str(e))

        await db.flush()
        return {"processed": success_count, "total": len(asset_ips)}


threat_intel_service = ThreatIntelService()
