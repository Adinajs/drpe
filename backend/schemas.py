# backend/schemas.py
# =============================================================
# Pydantic v2 Request & Response Schemas
# FIX: DiscoverRequest.target is now REQUIRED (no default).
#      Added WorkflowRequest for full-automation endpoint.
# =============================================================
from pydantic import BaseModel, Field, IPvAnyAddress, validator
from typing import Optional, List, Any, Dict
from datetime import datetime
from enum import Enum
import re


# ── Enums ─────────────────────────────────────────────────────

class CriticalityEnum(str, Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


class SeverityEnum(str, Enum):
    critical      = "critical"
    high          = "high"
    medium        = "medium"
    low           = "low"
    informational = "informational"


# ── Generic response wrapper ──────────────────────────────────

class ApiResponse(BaseModel):
    success: bool
    message: str
    data:    Optional[Any] = None


# ── Request schemas ───────────────────────────────────────────

class DiscoverRequest(BaseModel):
    """
    FIX: `target` is now REQUIRED.
    The API will never fall back to a hardcoded SCAN_NETWORK_RANGE.
    """
    target: str = Field(
        ...,
        description="IP, CIDR, or range to scan. e.g. 192.168.1.1, 192.168.1.0/24, 10.0.0.1-50",
        examples=["192.168.1.0/24", "10.10.10.5", "172.16.0.1-20"],
    )
    flags: Optional[str] = Field(
        None,
        description="Optional Nmap flags override, e.g. -sV -T4 --open",
    )


class ScanRequest(BaseModel):
    """Trigger an OpenVAS scan for a specific asset IP."""
    asset_ip:  str  = Field(..., description="Target IP address to scan")
    scan_name: Optional[str] = None


class WorkflowRequest(BaseModel):
    """
    Full automation workflow: Nmap → OpenVAS → Threat Intel → Risk Score.
    target_ip is required and entered by the user in the dashboard.
    """
    target_ip: str = Field(
        ...,
        description="Single IP or CIDR range to run the full workflow against",
        examples=["192.168.1.1", "10.0.0.0/24"],
    )
    nmap_flags: Optional[str] = Field(
        None,
        description="Optional Nmap flags, defaults to settings.NMAP_FLAGS",
    )
    openvas_config_id: Optional[str] = Field(
        None,
        description="OpenVAS scan config UUID, defaults to Full and Fast",
    )
    openvas_scanner_id: Optional[str] = Field(
        None,
        description="OpenVAS scanner UUID, defaults to OpenVAS default scanner",
    )


class AssetUpdate(BaseModel):
    criticality: Optional[CriticalityEnum] = None
    hostname:    Optional[str] = None
    notes:       Optional[str] = None
    tags:        Optional[List[str]] = None


# ── Response schemas ──────────────────────────────────────────

class PortInfo(BaseModel):
    port:     int
    protocol: str
    service:  Optional[str]
    version:  Optional[str]
    product:  Optional[str]


class AssetOut(BaseModel):
    id:          str
    ip_address:  str
    hostname:    Optional[str]
    mac_address: Optional[str]
    os_detected: Optional[str]
    open_ports:  List[PortInfo] = []
    criticality: CriticalityEnum
    status:      str
    tags:        List[str] = []
    first_seen:  Optional[datetime]
    last_seen:   Optional[datetime]


class ScanOut(BaseModel):
    id:               str
    scan_name:        str
    target_range:     Optional[str]
    asset_id:         Optional[str]
    openvas_task_id:  Optional[str]
    status:           str
    started_at:       Optional[datetime]
    completed_at:     Optional[datetime]
    error_message:    Optional[str]


class VulnerabilityOut(BaseModel):
    id:               str
    asset_id:         str
    cve_id:           Optional[str]
    name:             str
    description:      Optional[str]
    severity:         SeverityEnum
    cvss_score:       Optional[float]
    cvss_vector:      Optional[str]
    port:             Optional[str]
    service:          Optional[str]
    solution:         Optional[str]
    exploit_available: bool
    exploit_details:  Optional[str]
    references:       List[Dict] = []


class ThreatIntelOut(BaseModel):
    asset_id:              str
    ip_address:            str
    abuse_confidence:      Optional[int]
    abuse_total_reports:   int
    otx_pulse_count:       int
    otx_malware_count:     int
    composite_threat_score: float
    is_tor:                bool


class RiskScoreOut(BaseModel):
    asset_id:            str
    normalized_score:    float
    risk_level:          SeverityEnum
    vuln_count:          int
    critical_vuln_count: int
    exploit_count:       int
    calculated_at:       Optional[datetime]


class DashboardSummary(BaseModel):
    enterprise_risk_score:       float
    total_assets:                int
    active_assets:               int
    total_vulnerabilities:       int
    exploitable_vulnerabilities: int
    severity_breakdown:          Dict[str, int]
    criticality_breakdown:       Dict[str, int]
    top_risky_assets:            List[Dict]
    recent_vulnerabilities:      List[VulnerabilityOut] = []


class HeatmapData(BaseModel):
    heatmap: List[Dict]
    total:   int


class TrendDataPoint(BaseModel):
    date:                  str
    enterprise_risk_score: float
    total_vulnerabilities: int
    critical_vulns:        int
    exploitable_vulns:     int
    total_assets:          int


class RiskCalcResponse(BaseModel):
    success:               bool
    assets_scored:         int
    enterprise_risk_score: float


# ── Auth schemas ──────────────────────────────────────────────

class UserCreate(BaseModel):
    full_name: str
    email:     str
    password:  str

class UserLogin(BaseModel):
    email:    str
    password: str

class UserOut(BaseModel):
    id:         str
    full_name:  str
    email:      str
    role:       str
    avatar_url: Optional[str] = None

class UserUpdate(BaseModel):
    full_name:  Optional[str] = None
    avatar_url: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password:      str

class Token(BaseModel):
    access_token: str
    token_type:   str
    user:         UserOut