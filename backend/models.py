# backend/models.py
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric, ARRAY,
    ForeignKey, DateTime, Date, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID, INET, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid
import enum


class AssetCriticality(str, enum.Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


class AssetStatus(str, enum.Enum):
    active   = "active"
    inactive = "inactive"
    unknown  = "unknown"


class ScanStatus(str, enum.Enum):
    pending   = "pending"
    running   = "running"
    completed = "completed"
    failed    = "failed"


class SeverityLevel(str, enum.Enum):
    critical      = "critical"
    high          = "high"
    medium        = "medium"
    low           = "low"
    informational = "informational"


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = {'extend_existing': True}

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ip_address  = Column(INET, nullable=False, unique=True)
    hostname    = Column(String(255))
    mac_address = Column(String(17))
    os_detected = Column(String(255))
    open_ports  = Column(JSONB, default=list)
    criticality = Column(SAEnum(AssetCriticality, name="asset_criticality", create_type=False), nullable=False, default=AssetCriticality.medium)
    status      = Column(SAEnum(AssetStatus,      name="asset_status",      create_type=False), nullable=False, default=AssetStatus.active)
    first_seen  = Column(DateTime(timezone=True), server_default=func.now())
    last_seen   = Column(DateTime(timezone=True), server_default=func.now())
    tags        = Column(ARRAY(Text), default=list)
    notes       = Column(Text)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    scans           = relationship("Scan",          back_populates="asset", cascade="all, delete-orphan")
    vulnerabilities = relationship("Vulnerability", back_populates="asset", cascade="all, delete-orphan")
    threat_intel    = relationship("ThreatIntel",   back_populates="asset", cascade="all, delete-orphan")
    risk_scores     = relationship("RiskScore",     back_populates="asset", cascade="all, delete-orphan")


class Scan(Base):
    __tablename__ = "scans"
    __table_args__ = {'extend_existing': True}

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_name         = Column(String(255), nullable=False)
    target_range      = Column(String(100))
    asset_id          = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="SET NULL"))
    openvas_task_id   = Column(String(100))
    openvas_report_id = Column(String(100))
    status            = Column(SAEnum(ScanStatus, name="scan_status", create_type=False), nullable=False, default=ScanStatus.pending)
    started_at        = Column(DateTime(timezone=True))
    completed_at      = Column(DateTime(timezone=True))
    error_message     = Column(Text)
    raw_report_path   = Column(Text)
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    asset           = relationship("Asset",         back_populates="scans")
    vulnerabilities = relationship("Vulnerability", back_populates="scan", cascade="all, delete-orphan")


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    __table_args__ = {'extend_existing': True}

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scan_id           = Column(UUID(as_uuid=True), ForeignKey("scans.id",  ondelete="CASCADE"), nullable=False)
    asset_id          = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    cve_id            = Column(String(20))
    nvt_oid           = Column(String(100))
    name              = Column(String(500), nullable=False)
    description       = Column(Text)
    severity          = Column(SAEnum(SeverityLevel, name="severity_level", create_type=False), nullable=False, default=SeverityLevel.medium)
    cvss_score        = Column(Numeric(4, 1))
    cvss_vector       = Column(String(100))
    port              = Column(String(20))
    service           = Column(String(100))
    solution          = Column(Text)
    references        = Column(JSONB, default=list)
    exploit_available = Column(Boolean, default=False)
    exploit_details   = Column(Text)
    false_positive    = Column(Boolean, default=False)
    first_seen        = Column(DateTime(timezone=True), server_default=func.now())
    last_seen         = Column(DateTime(timezone=True), server_default=func.now())
    created_at        = Column(DateTime(timezone=True), server_default=func.now())

    scan  = relationship("Scan",  back_populates="vulnerabilities")
    asset = relationship("Asset", back_populates="vulnerabilities")


class ThreatIntel(Base):
    __tablename__ = "threat_intel"
    __table_args__ = {'extend_existing': True}

    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id               = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    ip_address             = Column(INET, nullable=False)
    abuse_confidence       = Column(Integer)
    abuse_total_reports    = Column(Integer, default=0)
    abuse_last_reported    = Column(DateTime(timezone=True))
    abuse_country_code     = Column(String(3))
    abuse_isp              = Column(String(255))
    abuse_is_public        = Column(Boolean)
    abuse_is_tor           = Column(Boolean, default=False)
    otx_pulse_count        = Column(Integer, default=0)
    otx_malware_count      = Column(Integer, default=0)
    otx_threat_score       = Column(Numeric(5, 2), default=0)
    otx_tags               = Column(ARRAY(Text), default=list)
    otx_adversaries        = Column(ARRAY(Text), default=list)
    otx_pulse_names        = Column(JSONB, default=list)
    composite_threat_score = Column(Numeric(5, 2), default=0)
    raw_otx_response       = Column(JSONB)
    raw_abuse_response     = Column(JSONB)
    fetched_at             = Column(DateTime(timezone=True), server_default=func.now())
    created_at             = Column(DateTime(timezone=True), server_default=func.now())

    asset = relationship("Asset", back_populates="threat_intel")


class RiskScore(Base):
    __tablename__ = "risk_scores"
    __table_args__ = {'extend_existing': True}

    id                  = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id            = Column(UUID(as_uuid=True), ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    vulnerability_score = Column(Numeric(6, 2), default=0)
    threat_intel_score  = Column(Numeric(6, 2), default=0)
    exploit_bonus       = Column(Numeric(6, 2), default=0)
    criticality_weight  = Column(Numeric(4, 2), default=1.0)
    raw_risk_score      = Column(Numeric(8, 2), default=0)
    normalized_score    = Column(Numeric(5, 2), default=0)
    risk_level          = Column(SAEnum(SeverityLevel, name="severity_level", create_type=False), nullable=False, default=SeverityLevel.low)
    vuln_count          = Column(Integer, default=0)
    critical_vuln_count = Column(Integer, default=0)
    exploit_count       = Column(Integer, default=0)
    calculation_details = Column(JSONB)
    calculated_at       = Column(DateTime(timezone=True), server_default=func.now())
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    asset = relationship("Asset", back_populates="risk_scores")


class PostureHistory(Base):
    __tablename__ = "posture_history"
    __table_args__ = {'extend_existing': True}

    id                       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    snapshot_date            = Column(Date, nullable=False, unique=True)
    enterprise_risk_score    = Column(Numeric(5, 2), default=0)
    total_assets             = Column(Integer, default=0)
    active_assets            = Column(Integer, default=0)
    total_vulnerabilities    = Column(Integer, default=0)
    critical_vulnerabilities = Column(Integer, default=0)
    high_vulnerabilities     = Column(Integer, default=0)
    medium_vulnerabilities   = Column(Integer, default=0)
    low_vulnerabilities      = Column(Integer, default=0)
    exploitable_vulns        = Column(Integer, default=0)
    assets_at_critical_risk  = Column(Integer, default=0)
    assets_at_high_risk      = Column(Integer, default=0)
    avg_cvss_score           = Column(Numeric(4, 2), default=0)
    top_threats              = Column(JSONB, default=list)
    new_vulnerabilities      = Column(Integer, default=0)
    remediated_vulns         = Column(Integer, default=0)
    notes                    = Column(Text)
    created_at               = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email           = Column(String(255), nullable=False, unique=True)
    hashed_password = Column(String(255), nullable=False)
    full_name       = Column(String(255))
    avatar_url      = Column(Text)
    role            = Column(String(50), default="Admin")
    is_active       = Column(Boolean, default=True)
    last_login      = Column(DateTime(timezone=True))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tokens = relationship("ApiToken", back_populates="user", cascade="all, delete-orphan")


class ApiToken(Base):
    __tablename__ = "api_tokens"
    __table_args__ = {'extend_existing': True}

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    token_hash = Column(String(64), nullable=False, unique=True)
    name       = Column(String(100), nullable=False)
    is_active  = Column(Boolean, default=True)
    last_used  = Column(DateTime(timezone=True))
    expires_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="tokens")
class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = {'extend_existing': True}

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title      = Column(String(255), nullable=False)
    message    = Column(Text)
    type       = Column(String(50), default="info") # info, success, alert
    read       = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
class ActivityLog(Base):
    __tablename__ = "activity_logs"
    __table_args__ = {'extend_existing': True}

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title      = Column(String(512), nullable=False)
    details    = Column(Text)
    type       = Column(String(50), default="info") # info, success, alert, warning
    created_at = Column(DateTime(timezone=True), server_default=func.now())
