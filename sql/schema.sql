-- =============================================================
-- Dynamic Risk Posture Evaluation (DRPE) - PostgreSQL Schema
-- Module I: Risk Intelligence & Assessment
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================
-- ENUM TYPES
-- =============================================================

CREATE TYPE asset_criticality AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE asset_status      AS ENUM ('active', 'inactive', 'unknown');
CREATE TYPE scan_status       AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE severity_level    AS ENUM ('critical', 'high', 'medium', 'low', 'informational');

-- =============================================================
-- TABLE: assets
-- Stores all discovered network assets
-- =============================================================

CREATE TABLE assets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address      INET NOT NULL UNIQUE,
    hostname        VARCHAR(255),
    mac_address     VARCHAR(17),
    os_detected     VARCHAR(255),
    open_ports      JSONB DEFAULT '[]',          -- [{port, protocol, service, version}]
    criticality     asset_criticality NOT NULL DEFAULT 'medium',
    status          asset_status NOT NULL DEFAULT 'active',
    first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tags            TEXT[] DEFAULT '{}',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assets_ip           ON assets(ip_address);
CREATE INDEX idx_assets_criticality  ON assets(criticality);
CREATE INDEX idx_assets_status       ON assets(status);
CREATE INDEX idx_assets_last_seen    ON assets(last_seen);

-- =============================================================
-- TABLE: scans
-- Tracks all vulnerability scan jobs
-- =============================================================

CREATE TABLE scans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_name       VARCHAR(255) NOT NULL,
    target_range    VARCHAR(100),               -- e.g. "192.168.1.0/24"
    asset_id        UUID REFERENCES assets(id) ON DELETE SET NULL,
    openvas_task_id VARCHAR(100),               -- GVM task UUID
    openvas_report_id VARCHAR(100),             -- GVM report UUID
    status          scan_status NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error_message   TEXT,
    raw_report_path TEXT,                       -- path to XML export on disk
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scans_status     ON scans(status);
CREATE INDEX idx_scans_asset_id   ON scans(asset_id);
CREATE INDEX idx_scans_created_at ON scans(created_at DESC);

-- =============================================================
-- TABLE: vulnerabilities
-- Stores parsed vulnerabilities from OpenVAS reports
-- =============================================================

CREATE TABLE vulnerabilities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scan_id         UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    cve_id          VARCHAR(20),                -- e.g. CVE-2021-44228
    nvt_oid         VARCHAR(100),               -- OpenVAS NVT OID
    name            VARCHAR(500) NOT NULL,
    description     TEXT,
    severity        severity_level NOT NULL DEFAULT 'medium',
    cvss_score      NUMERIC(4,1) CHECK (cvss_score >= 0 AND cvss_score <= 10),
    cvss_vector     VARCHAR(100),
    port            VARCHAR(20),                -- e.g. "443/tcp"
    service         VARCHAR(100),
    solution        TEXT,
    "references"      JSONB DEFAULT '[]',         -- [{url, type}]
    exploit_available BOOLEAN DEFAULT FALSE,
    exploit_details TEXT,
    false_positive  BOOLEAN DEFAULT FALSE,
    first_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vuln_asset_id    ON vulnerabilities(asset_id);
CREATE INDEX idx_vuln_scan_id     ON vulnerabilities(scan_id);
CREATE INDEX idx_vuln_cve_id      ON vulnerabilities(cve_id);
CREATE INDEX idx_vuln_severity    ON vulnerabilities(severity);
CREATE INDEX idx_vuln_cvss        ON vulnerabilities(cvss_score DESC);
CREATE INDEX idx_vuln_exploit     ON vulnerabilities(exploit_available);
CREATE INDEX idx_vuln_cve_text    ON vulnerabilities USING gin(cve_id gin_trgm_ops);

-- =============================================================
-- TABLE: threat_intel
-- Stores OTX + AbuseIPDB reputation data per IP
-- =============================================================

CREATE TABLE threat_intel (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id            UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    ip_address          INET NOT NULL,
    -- AbuseIPDB fields
    abuse_confidence    INTEGER CHECK (abuse_confidence >= 0 AND abuse_confidence <= 100),
    abuse_total_reports INTEGER DEFAULT 0,
    abuse_last_reported TIMESTAMPTZ,
    abuse_country_code  VARCHAR(3),
    abuse_isp           VARCHAR(255),
    abuse_is_public     BOOLEAN,
    abuse_is_tor        BOOLEAN DEFAULT FALSE,
    -- OTX fields
    otx_pulse_count     INTEGER DEFAULT 0,
    otx_malware_count   INTEGER DEFAULT 0,
    otx_threat_score    NUMERIC(5,2) DEFAULT 0,
    otx_tags            TEXT[] DEFAULT '{}',
    otx_adversaries     TEXT[] DEFAULT '{}',
    otx_pulse_names     JSONB DEFAULT '[]',
    -- Aggregated threat score (0-100)
    composite_threat_score NUMERIC(5,2) DEFAULT 0,
    raw_otx_response    JSONB,
    raw_abuse_response  JSONB,
    fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threat_asset_id ON threat_intel(asset_id);
CREATE INDEX idx_threat_ip       ON threat_intel(ip_address);
CREATE INDEX idx_threat_score    ON threat_intel(composite_threat_score DESC);
CREATE INDEX idx_threat_fetched  ON threat_intel(fetched_at DESC);

-- Only keep latest threat intel per asset
CREATE UNIQUE INDEX idx_threat_asset_latest ON threat_intel(asset_id, fetched_at DESC);

-- =============================================================
-- TABLE: risk_scores
-- Per-asset risk scores calculated by the risk engine
-- =============================================================

CREATE TABLE risk_scores (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id            UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    -- Score components
    vulnerability_score NUMERIC(6,2) DEFAULT 0,   -- weighted CVSS aggregate
    threat_intel_score  NUMERIC(6,2) DEFAULT 0,   -- from threat_intel composite
    exploit_bonus       NUMERIC(6,2) DEFAULT 0,   -- additional score for exploitable vulns
    criticality_weight  NUMERIC(4,2) DEFAULT 1.0, -- 3/2/1.5/1
    -- Final
    raw_risk_score      NUMERIC(8,2) DEFAULT 0,   -- before normalization
    normalized_score    NUMERIC(5,2) DEFAULT 0,   -- 0-100
    risk_level          severity_level NOT NULL DEFAULT 'low',
    vuln_count          INTEGER DEFAULT 0,
    critical_vuln_count INTEGER DEFAULT 0,
    exploit_count       INTEGER DEFAULT 0,
    calculation_details JSONB,                    -- full breakdown for audit
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_risk_asset_id  ON risk_scores(asset_id);
CREATE INDEX idx_risk_score     ON risk_scores(normalized_score DESC);
CREATE INDEX idx_risk_level     ON risk_scores(risk_level);
CREATE INDEX idx_risk_calc_at   ON risk_scores(calculated_at DESC);

-- =============================================================
-- TABLE: posture_history
-- Enterprise-wide risk posture snapshots over time
-- =============================================================

CREATE TABLE posture_history (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_date           DATE NOT NULL,
    -- Aggregate metrics
    enterprise_risk_score   NUMERIC(5,2) DEFAULT 0,  -- 0-100
    total_assets            INTEGER DEFAULT 0,
    active_assets           INTEGER DEFAULT 0,
    total_vulnerabilities   INTEGER DEFAULT 0,
    critical_vulnerabilities INTEGER DEFAULT 0,
    high_vulnerabilities    INTEGER DEFAULT 0,
    medium_vulnerabilities  INTEGER DEFAULT 0,
    low_vulnerabilities     INTEGER DEFAULT 0,
    exploitable_vulns       INTEGER DEFAULT 0,
    assets_at_critical_risk INTEGER DEFAULT 0,
    assets_at_high_risk     INTEGER DEFAULT 0,
    avg_cvss_score          NUMERIC(4,2) DEFAULT 0,
    top_threats             JSONB DEFAULT '[]',       -- [{ip, score, reason}]
    new_vulnerabilities     INTEGER DEFAULT 0,        -- compared to previous snapshot
    remediated_vulns        INTEGER DEFAULT 0,
    notes                   TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_posture_date ON posture_history(snapshot_date);
CREATE INDEX idx_posture_score       ON posture_history(enterprise_risk_score DESC);

-- =============================================================
-- TABLE: users
-- Stores user accounts for authentication
-- =============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    role            VARCHAR(50) DEFAULT 'Admin',
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- TABLE: api_tokens
-- Simple token-based authentication
-- =============================================================

CREATE TABLE api_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 of token
    name        VARCHAR(100) NOT NULL,          -- e.g. "dashboard", "ci-pipeline"
    is_active   BOOLEAN DEFAULT TRUE,
    last_used   TIMESTAMPTZ,
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tokens_hash ON api_tokens(token_hash);
CREATE INDEX idx_tokens_user ON api_tokens(user_id);

-- =============================================================
-- TABLE: scan_schedules
-- Optional: future scheduled scan support
-- =============================================================

CREATE TABLE scan_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    target_range    VARCHAR(100) NOT NULL,
    cron_expression VARCHAR(50) NOT NULL,       -- e.g. "0 2 * * 1"
    is_active       BOOLEAN DEFAULT TRUE,
    last_run        TIMESTAMPTZ,
    next_run        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- VIEWS
-- =============================================================

-- Latest risk score per asset
CREATE VIEW v_current_risk AS
SELECT DISTINCT ON (rs.asset_id)
    a.id,
    a.ip_address,
    a.hostname,
    a.criticality,
    a.status,
    rs.normalized_score,
    rs.risk_level,
    rs.vuln_count,
    rs.critical_vuln_count,
    rs.exploit_count,
    rs.calculated_at,
    ti.composite_threat_score,
    ti.abuse_confidence,
    ti.otx_pulse_count
FROM assets a
LEFT JOIN risk_scores rs ON rs.asset_id = a.id
LEFT JOIN LATERAL (
    SELECT * FROM threat_intel
    WHERE asset_id = a.id
    ORDER BY fetched_at DESC LIMIT 1
) ti ON TRUE
ORDER BY rs.asset_id, rs.calculated_at DESC;

-- Dashboard summary view
CREATE VIEW v_dashboard_summary AS
SELECT
    COUNT(DISTINCT a.id) AS total_assets,
    COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'active') AS active_assets,
    COUNT(DISTINCT v.id) AS total_vulnerabilities,
    COUNT(DISTINCT v.id) FILTER (WHERE v.severity = 'critical') AS critical_vulns,
    COUNT(DISTINCT v.id) FILTER (WHERE v.severity = 'high') AS high_vulns,
    COUNT(DISTINCT v.id) FILTER (WHERE v.exploit_available = TRUE) AS exploitable_vulns,
    ROUND(AVG(v.cvss_score), 2) AS avg_cvss,
    ROUND(AVG(rs.normalized_score), 2) AS avg_risk_score
FROM assets a
LEFT JOIN vulnerabilities v ON v.asset_id = a.id AND v.false_positive = FALSE
LEFT JOIN LATERAL (
    SELECT normalized_score FROM risk_scores
    WHERE asset_id = a.id
    ORDER BY calculated_at DESC LIMIT 1
) rs ON TRUE;

-- =============================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- SEED DATA: default API token (change before production!)
-- token value: "drpe-dev-token-change-me"
-- SHA-256 of above stored below
-- =============================================================

INSERT INTO api_tokens (token_hash, name)
VALUES (
    encode(sha256('drpe-5af890944fd1e57cff37a67b8e946ee2'::bytea), 'hex'),
    'default-dev-token'
);
