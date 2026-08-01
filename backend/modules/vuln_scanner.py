# backend/modules/vuln_scanner.py
# =============================================================
# OpenVAS / GVM Integration Module - FIXED VERSION
# Key fixes:
#   1. Fetch partial results even if gvmd crashes
#   2. Increased SSH timeout for large reports
#   3. Better error recovery
#   4. Correct report filter including all severity levels
# =============================================================
import asyncio
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import paramiko
import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, cast
from sqlalchemy.dialects.postgresql import INET
from models import Asset, Scan, Vulnerability, ScanStatus, SeverityLevel
from config import settings
from modules.risk_engine import risk_engine

logger = structlog.get_logger()


# ── CVSS score → SeverityLevel mapping ───────────────────────

def cvss_to_severity(score: float) -> SeverityLevel:
    if score >= 9.0:  return SeverityLevel.critical
    if score >= 7.0:  return SeverityLevel.high
    if score >= 4.0:  return SeverityLevel.medium
    if score > 0.0:   return SeverityLevel.low
    return SeverityLevel.informational


# ── GVM SSH Client ────────────────────────────────────────────

class GVMSSHClient:
    def __init__(self):
        self.ssh: Optional[paramiko.SSHClient] = None

    def _connect(self):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        connect_kwargs = {
            "hostname": settings.KALI_HOST,
            "port":     settings.KALI_PORT,
            "username": settings.KALI_USER,
            "timeout":  30,
        }
        if settings.KALI_PASSWORD:
            connect_kwargs["password"] = settings.KALI_PASSWORD
        else:
            connect_kwargs["key_filename"] = settings.KALI_SSH_KEY_PATH

        try:
            client.connect(**connect_kwargs)
        except Exception as exc:
            logger.error("SSH connect failed", error=str(exc))
            raise ConnectionError(f"Could not connect to Kali: {exc}")
        return client

    def _exec(self, cmd: str, timeout: int = 300) -> tuple:
        """Execute SSH command with configurable timeout."""
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            ssh = None
            try:
                ssh = self._connect()
                _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
                out = stdout.read().decode("utf-8", errors="replace")
                err = stderr.read().decode("utf-8", errors="replace")
                if err and "warning" not in err.lower():
                    logger.warning("SSH stderr", cmd=cmd[:80], stderr=err[:300])
                return out, err
            except (paramiko.SSHException, ConnectionError, OSError) as exc:
                logger.warning("SSH command failed", attempt=attempt, error=str(exc))
                if attempt == max_retries:
                    raise RuntimeError(f"GVM command failed after {max_retries} attempts: {exc}")
                time.sleep(5)
            finally:
                if ssh:
                    ssh.close()

    def _get_gvm_cli_base(self) -> str:
        base = (
            f"gvm-cli --gmp-username {settings.GVM_USERNAME} "
            f"--gmp-password {settings.GVM_PASSWORD} "
        )
        if settings.GVM_CONNECTION_TYPE.lower() in ["tls", "tcp"]:
            base += f"tls --hostname {settings.GVM_HOST} --port {settings.GVM_PORT} "
        else:
            base += f"socket --socketpath {settings.GVM_SOCKET_PATH} "
        return base

    def get_port_list_id(self) -> str:
        """Fetch available port lists from GVM and return the best matching UUID."""
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} --xml '<get_port_lists/>'"
        )
        try:
            root = ET.fromstring(out)
            port_lists = root.findall(".//port_list")
            if not port_lists:
                raise ValueError("No port lists found in GVM")

            # Prefer "All IANA assigned TCP" or "All TCP" variants
            preferred_keywords = [
                "all iana assigned tcp and udp",
                "all iana assigned tcp",
                "all tcp and nmap",
                "all tcp",
            ]
            name_to_id = {
                (pl.findtext("name") or "").lower(): pl.attrib.get("id", "")
                for pl in port_lists
                if pl.attrib.get("id")
            }
            for keyword in preferred_keywords:
                for pl_name, pl_id in name_to_id.items():
                    if keyword in pl_name and pl_id:
                        logger.info("Selected port list", name=pl_name, id=pl_id)
                        return pl_id

            # Fallback: return first valid UUID
            first_id = next(iter(name_to_id.values()), None)
            if first_id:
                logger.info("Using first available port list", id=first_id)
                return first_id

        except ET.ParseError:
            logger.warning("Could not parse get_port_lists response", output=out[:200])

        raise ValueError("Could not determine a valid port list ID from GVM")

    def get_target_id_by_name(self, name: str) -> Optional[str]:
        """Check if a target with this name already exists in GVM."""
        cmd = f"{self._get_gvm_cli_base()} --xml '<get_targets filter=\"name={name}\"/>'"
        out, err = self._exec(cmd)
        try:
            root = ET.fromstring(out)
            target = root.find(".//target")
            if target is not None:
                return target.attrib.get("id")
        except ET.ParseError:
            pass
        return None

    def create_task(self, name: str, target_ip: str, config_id: str, scanner_id: str) -> str:
        # 1. Check if target exists
        target_name = f"{name}_target"
        target_id = self.get_target_id_by_name(target_name)
        
        if not target_id:
            # Dynamically resolve port list UUID
            port_list_id = self.get_port_list_id()
            create_target_xml = (
                f"<create_target><name>{target_name}</name>"
                f"<hosts>{target_ip}</hosts>"
                f"<port_list id=\"{port_list_id}\"/></create_target>"
            )
            target_out, target_err = self._exec(
                f"{self._get_gvm_cli_base()} --xml '{create_target_xml}'"
            )
            try:
                if not target_out.strip():
                    raise ValueError(f"GVM create_target returned empty response. Error: {target_err}")
                root = ET.fromstring(target_out)
                target_id = root.attrib.get("id", "")
                if not target_id:
                    raise ValueError(f"GVM target creation failed: {target_out}")
            except ET.ParseError as e:
                raise ValueError(f"GVM returned invalid XML: {target_out[:200]}")
        else:
            logger.info("Reusing existing GVM target", name=target_name, id=target_id)

        # 2. Check if task exists (to avoid duplicate tasks for same IP)
        cmd_task = f"{self._get_gvm_cli_base()} --xml '<get_tasks filter=\"name={name}\"/>'"
        task_info, _ = self._exec(cmd_task)
        try:
            task_root = ET.fromstring(task_info)
            existing_task = task_root.find(".//task")
            if existing_task is not None:
                logger.info("Reusing existing GVM task", name=name, id=existing_task.attrib.get("id"))
                return task_info # Return existing task XML response
        except ET.ParseError:
            pass

        create_task_xml = (
            f"<create_task><name>{name}</name>"
            f"<config id=\"{config_id}\"/>"
            f"<target id=\"{target_id}\"/>"
            f"<scanner id=\"{scanner_id}\"/></create_task>"
        )
        out, err = self._exec(f"{self._get_gvm_cli_base()} --xml '{create_task_xml}'")
        return out

    def start_task(self, task_id: str) -> str:
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} --xml '<start_task task_id=\"{task_id}\"/>'"
        )
        return out

    def get_task_status(self, task_id: str) -> Dict[str, str]:
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} --xml '<get_tasks task_id=\"{task_id}\"/>'"
        )
        try:
            if not out.strip():
                return {"status": "unknown", "error": "Empty response from GVM"}
            root = ET.fromstring(out)
            task_el = root.find(".//task")
            if task_el is None:
                return {"status": "unknown"}
            status   = task_el.findtext("status") or "unknown"
            progress = task_el.findtext("progress") or "0"
            return {"status": status, "progress": progress}
        except ET.ParseError:
            return {"status": "error", "error": "Invalid XML from GVM"}

    def get_report_xml(self, report_id: str) -> str:
        """Download full XML report — increased timeout for large reports."""
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} "
            f"--xml '<get_reports report_id=\"{report_id}\" "
            f"ignore_pagination=\"1\" "
            f"filter=\"levels=hmlgc rows=-1\" details=\"1\"/>'",
            timeout=600,  # 10 min timeout for large reports
        )
        if not out.strip():
            logger.warning("Empty report XML, trying without filter")
            # Fallback — fetch without filter
            out, err = self._exec(
                f"{self._get_gvm_cli_base()} "
                f"--xml '<get_reports report_id=\"{report_id}\" details=\"1\"/>'",
                timeout=600,
            )
        return out

    def get_latest_report_id_for_task(self, task_id: str) -> Optional[str]:
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} --xml '<get_tasks task_id=\"{task_id}\"/>'"
        )
        try:
            root = ET.fromstring(out)
            # Try last_report first
            last_report = root.find(".//last_report/report")
            if last_report is not None:
                return last_report.attrib.get("id")
            # Fallback to any report
            any_report = root.find(".//reports/report")
            if any_report is not None:
                return any_report.attrib.get("id")
        except ET.ParseError:
            pass
        return None

    def get_all_reports(self) -> Optional[str]:
        """Fetch ALL reports — used as fallback when task report ID is missing."""
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} "
            f"--xml '<get_reports filter=\"rows=-1 levels=hmlgc\"/>'",
            timeout=600,
        )
        return out if out.strip() else None

    def rescue_partial_results(self, task_id: str) -> Optional[str]:
        """
        Try to fetch partial results directly from the database via gvm-cli.
        Used when gvmd crashes mid-scan.
        """
        # Try fetching results directly 
        out, err = self._exec(
            f"{self._get_gvm_cli_base()} "
            f"--xml '<get_results task_id=\"{task_id}\" "
            f"filter=\"levels=hmlgc rows=-1\"/>'",
            timeout=300,
        )
        if out.strip() and "<get_results_response" in out:
            logger.info("Rescued partial results via get_results", task_id=task_id)
            return out
        return None


# ── XML Report Parser ─────────────────────────────────────────

class OpenVASReportParser:
    EXPLOIT_SOURCES = ["exploit-db", "metasploit", "exploitdb", "edb-id"]

    def parse(self, xml_content: str) -> List[Dict[str, Any]]:
        """Parse get_reports_response OR get_results_response XML."""
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.error("XML parse error", error=str(e))
            return []

        results = []
        for result in root.findall(".//result"):
            vuln = self._parse_result(result)
            if vuln:
                results.append(vuln)

        logger.info("Parsed OpenVAS report", total_results=len(results))
        return results

    def _parse_result(self, result_el: ET.Element) -> Optional[Dict[str, Any]]:
        try:
            nvt     = result_el.find("nvt")
            host_el = result_el.find("host")
            port_el = result_el.find("port")

            if nvt is None or host_el is None:
                return None

            host_ip = (host_el.text or "").strip()
            if not host_ip:
                return None

            # CVSS
            cvss_score = 0.0
            severity_el = result_el.find("severity")
            if severity_el is not None and severity_el.text:
                try:
                    cvss_score = float(severity_el.text)
                except ValueError:
                    pass

            # Skip pure informational (score == 0) to reduce noise
            # Comment this out if you want ALL results
            # if cvss_score == 0.0:
            #     return None

            # CVE references
            cve_id = None
            refs = []
            exploit_available = False
            exploit_details = None

            for ref in nvt.findall("refs/ref"):
                ref_type = ref.attrib.get("type", "").lower()
                ref_id   = ref.attrib.get("id", "")
                refs.append({"type": ref_type, "id": ref_id})
                if ref_type == "cve":
                    cve_id = ref_id
                if any(src in ref_id.lower() for src in self.EXPLOIT_SOURCES):
                    exploit_available = True
                    exploit_details = f"{ref_type}: {ref_id}"

            port_str = port_el.text if port_el is not None else None
            nvt_oid  = nvt.attrib.get("oid", "")
            name     = nvt.findtext("name") or "Unknown"
            desc     = result_el.findtext("description") or ""
            solution = nvt.findtext("solution") or ""
            tags_raw = nvt.findtext("tags") or ""
            cvss_vector = self._extract_tag(tags_raw, "cvss_base_vector")

            return {
                "host_ip":           host_ip,
                "nvt_oid":           nvt_oid,
                "name":              name,
                "description":       desc,
                "severity":          cvss_to_severity(cvss_score),
                "cvss_score":        round(cvss_score, 1),
                "cvss_vector":       cvss_vector,
                "cve_id":            cve_id,
                "port":              port_str,
                "service":           self._extract_service(port_str),
                "solution":          solution,
                "references":        refs,
                "exploit_available": exploit_available,
                "exploit_details":   exploit_details,
            }
        except Exception as e:
            logger.warning("Failed to parse result", error=str(e))
            return None

    def _extract_tag(self, tags: str, key: str) -> Optional[str]:
        match = re.search(rf"{key}=([^|]+)", tags)
        return match.group(1).strip() if match else None

    def _extract_service(self, port_str: Optional[str]) -> Optional[str]:
        if not port_str:
            return None
        common = {
            "80": "http", "443": "https", "22": "ssh", "21": "ftp",
            "25": "smtp", "445": "smb", "3306": "mysql", "5432": "postgres",
            "3389": "rdp", "8080": "http-alt", "8443": "https-alt",
            "23": "telnet", "139": "netbios", "1099": "rmiregistry",
            "1524": "ingreslock", "2049": "nfs", "2121": "ftp-proxy",
            "3632": "distccd", "5900": "vnc", "6000": "x11",
            "6667": "irc", "8180": "http-alt", "49152": "unknown",
        }
        port_num = port_str.split("/")[0]
        return common.get(port_num)


# ── Scan Service ──────────────────────────────────────────────

class VulnerabilityScanner:
    def __init__(self):
        self.gvm    = GVMSSHClient()
        self.parser = OpenVASReportParser()

    async def start_scan_for_asset(
        self,
        db: AsyncSession,
        asset_ip: str,
        scan_name: str | None = None,
        config_id: str = "8715c877-47a0-438d-98a3-27c7a6ab2196",  # Discovery (Lightweight)
        scanner_id: str = "08b69003-5fc2-4037-a479-93b440211c73",
    ) -> Scan:
        scan_name = scan_name or f"DRPE-{asset_ip}-{datetime.now().strftime('%Y%m%d%H%M')}"

        result = await db.execute(select(Asset).where(Asset.ip_address == cast(asset_ip, INET)))
        asset = result.scalar_one_or_none()
        if not asset:
            raise ValueError(f"Asset {asset_ip} not found in database")

        scan = Scan(
            scan_name    = scan_name,
            target_range = asset_ip,
            asset_id     = asset.id,
            status       = ScanStatus.pending,
        )
        db.add(scan)
        await db.flush()

        try:
            loop = asyncio.get_event_loop()
            task_xml = await loop.run_in_executor(
                None, self.gvm.create_task, scan_name, asset_ip, config_id, scanner_id
            )
            root = ET.fromstring(task_xml)
            task_id = root.attrib.get("id")
            if not task_id:
                # If we reused an existing task, the root is <get_tasks_response> and the ID is inside <task>
                task_el = root.find(".//task")
                if task_el is not None:
                    task_id = task_el.attrib.get("id")
            
            if not task_id:
                raise RuntimeError(f"GVM create_task failed: {task_xml[:200]}")


            await loop.run_in_executor(None, self.gvm.start_task, task_id)

            await db.execute(
                update(Scan).where(Scan.id == scan.id).values(
                    openvas_task_id = task_id,
                    status          = ScanStatus.running,
                    started_at      = datetime.now(timezone.utc),
                )
            )
            # Log mission start
            from models import ActivityLog
            db.add(ActivityLog(
                title=f"Tactical Scan Initiated: {scan_name}",
                details=f"GVM task established for target IP {asset_ip}. Strategic reconnaissance in progress.",
                type="info"
            ))
            await db.flush()
            
            logger.info("GVM scan started", task_id=task_id, asset=asset_ip)

        except Exception as e:
            await db.execute(
                update(Scan).where(Scan.id == scan.id)
                .values(status=ScanStatus.failed, error_message=str(e))
            )
            logger.error("Failed to start GVM scan", error=str(e))
            raise

        return scan

    async def fetch_and_store_results(self, db: AsyncSession, scan_id: str) -> int:
        """
        Download report, parse, store vulnerabilities.
        Has multiple fallback strategies for when gvmd crashes.
        """
        result = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            raise ValueError(f"Scan {scan_id} not found")
        if not scan.openvas_task_id:
            raise ValueError("Scan has no GVM task ID")

        loop = asyncio.get_event_loop()
        xml_content = None
        report_id = None

        # ── Strategy 1: Normal report fetch ──────────────────
        try:
            report_id = await loop.run_in_executor(
                None, self.gvm.get_latest_report_id_for_task, scan.openvas_task_id
            )
            if report_id:
                logger.info("Fetching report", report_id=report_id)
                xml_content = await loop.run_in_executor(
                    None, self.gvm.get_report_xml, report_id
                )
                if not xml_content or not xml_content.strip():
                    logger.warning("Empty report XML, trying fallback strategies")
                    xml_content = None
        except Exception as e:
            logger.warning("Strategy 1 failed", error=str(e))

        # ── Strategy 2: Rescue partial results directly ───────
        if not xml_content:
            try:
                logger.info("Trying to rescue partial results", task_id=scan.openvas_task_id)
                xml_content = await loop.run_in_executor(
                    None, self.gvm.rescue_partial_results, scan.openvas_task_id
                )
            except Exception as e:
                logger.warning("Strategy 2 failed", error=str(e))

        # ── Strategy 3: Fetch all reports as last resort ──────
        if not xml_content:
            try:
                logger.info("Fetching all available reports as last resort")
                xml_content = await loop.run_in_executor(
                    None, self.gvm.get_all_reports
                )
            except Exception as e:
                logger.warning("Strategy 3 failed", error=str(e))

        if not xml_content:
            raise RuntimeError("Could not retrieve any scan results after 3 attempts")

        # ── Parse results ─────────────────────────────────────
        vulns_data = self.parser.parse(xml_content)
        logger.info("Parsed vulnerabilities", count=len(vulns_data))

        # ── Store results ─────────────────────────────────────
        count = 0
        for vd in vulns_data:
            vuln = Vulnerability(
                scan_id           = scan.id,
                asset_id          = scan.asset_id,
                cve_id            = vd["cve_id"],
                nvt_oid           = vd["nvt_oid"],
                name              = vd["name"],
                description       = vd["description"],
                severity          = vd["severity"],
                cvss_score        = vd["cvss_score"],
                cvss_vector       = vd["cvss_vector"],
                port              = vd["port"],
                service           = vd["service"],
                solution          = vd["solution"],
                references        = vd["references"],
                exploit_available = vd["exploit_available"],
                exploit_details   = vd["exploit_details"],
            )
            db.add(vuln)
            count += 1

        await db.execute(
            update(Scan).where(Scan.id == scan.id).values(
                status            = ScanStatus.completed,
                completed_at      = datetime.now(timezone.utc),
                openvas_report_id = report_id,
            )
        )

        await db.flush()
        
        # ── Trigger Risk Engine Update ────────────────────────
        try:
            logger.info("Triggering automatic risk recalculation after scan results")
            await risk_engine.calculate_all_assets(db)
            await risk_engine.take_posture_snapshot(db)
            await db.commit()
        except Exception as re_err:
            logger.error("Automatic risk update failed", error=str(re_err))

        # Log mission completion
        from models import ActivityLog
        db.add(ActivityLog(
            title=f"Scan Synchronization Complete: {scan.scan_name}",
            details=f"Successfully imported {count} findings. Risk engine recalibrated for target node.",
            type="success" if count > 0 else "info"
        ))
        
        logger.info("Vulnerabilities stored and risk updated", scan_id=str(scan_id), count=count)
        return count

    async def get_scan_status(self, task_id: str) -> Dict[str, str]:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.gvm.get_task_status, task_id)


vuln_scanner = VulnerabilityScanner()