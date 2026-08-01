# backend/modules/risk_engine.py
# =============================================================
# Dynamic Risk Scoring Engine
#
# Formula:
#   Risk Score = (CVSS × Exploit_Multiplier × Asset_Criticality_Weight)
#                + Threat_Intelligence_Score
#
# Asset Weights:   critical=3.0, high=2.0, medium=1.5, low=1.0
# Exploit Multi:   1.5 if exploit exists, else 1.0
# Max raw score normalised to 0–100 for display
# =============================================================
import asyncio
import structlog
import json
import os
from datetime import datetime, date, timezone
from typing import List, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sa_func
from models import (
    Asset, Vulnerability, ThreatIntel, RiskScore, PostureHistory,
    AssetCriticality, SeverityLevel
)

logger = structlog.get_logger()


# ── Constants ─────────────────────────────────────────────────

CRITICALITY_WEIGHTS: Dict[str, float] = {
    "critical": 3.0,
    "high":     2.0,
    "medium":   1.5,
    "low":      1.0,
}

EXPLOIT_MULTIPLIER_PRESENT = 1.5
EXPLOIT_MULTIPLIER_ABSENT  = 1.0

# Maximum theoretical raw score (CVSS=10 × exploit=1.5 × criticality=3 × threat=100)
# Used for normalisation ceiling
RAW_SCORE_CEILING = 600.0

# Risk level thresholds (normalized 0-100)
RISK_THRESHOLDS = {
    SeverityLevel.critical:       80.0,
    SeverityLevel.high:           60.0,
    SeverityLevel.medium:         35.0,
    SeverityLevel.low:            10.0,
    SeverityLevel.informational:  0.0,
}


def score_to_level(score: float) -> SeverityLevel:
    for level, threshold in RISK_THRESHOLDS.items():
        if score >= threshold:
            return level
    return SeverityLevel.informational


class RiskScoringEngine:

    # ── Per-asset scoring ─────────────────────────────────────

    async def calculate_asset_risk(
        self,
        db: AsyncSession,
        asset: Asset,
    ) -> RiskScore:
        """
        Calculate risk score for a single asset.
        Aggregates all non-false-positive vulnerabilities.
        """
        criticality_weight = CRITICALITY_WEIGHTS.get(asset.criticality.value, 1.5)

        # Fetch vulnerabilities
        result = await db.execute(
            select(Vulnerability)
            .where(
                Vulnerability.asset_id == asset.id,
                Vulnerability.false_positive == False,
            )
        )
        vulns: List[Vulnerability] = result.scalars().all()

        # Fetch latest threat intel
        ti_result = await db.execute(
            select(ThreatIntel)
            .where(ThreatIntel.asset_id == asset.id)
            .order_by(ThreatIntel.fetched_at.desc())
            .limit(1)
        )
        latest_ti: Optional[ThreatIntel] = ti_result.scalar_one_or_none()
        threat_score = float(latest_ti.composite_threat_score) if latest_ti else 0.0

        # ── Vulnerability score component ─────────────────────
        # Sum: CVSS × exploit_multiplier for each vuln
        # We weight critical vulns more heavily by using CVSS as-is (already 0-10)
        vuln_raw_sum = 0.0
        exploit_count   = 0
        critical_count  = 0
        exploit_bonus   = 0.0

        for v in vulns:
            cvss = float(v.cvss_score or 0)
            multiplier = EXPLOIT_MULTIPLIER_PRESENT if v.exploit_available else EXPLOIT_MULTIPLIER_ABSENT
            vuln_raw_sum += cvss * multiplier

            if v.exploit_available:
                exploit_count  += 1
                exploit_bonus  += cvss * (EXPLOIT_MULTIPLIER_PRESENT - 1.0)
            if v.severity == SeverityLevel.critical:
                critical_count += 1

        # Apply criticality weight
        vulnerability_score = vuln_raw_sum * criticality_weight

        # ── Threat intel component ────────────────────────────
        # Threat score contributes directly (0-100 → scaled)
        ti_component = (threat_score / 100.0) * 30.0  # max 30 points contribution

        # ── Raw risk score ────────────────────────────────────
        raw_score = vulnerability_score + ti_component

        # ── Normalise to 0-100 ────────────────────────────────
        # Ceiling per asset = 10 × 1.5 × 3.0 × max_vulns_factor + 30
        # We cap raw_score against a generous ceiling
        max_vuln_ceiling = max(len(vulns) * 10 * EXPLOIT_MULTIPLIER_PRESENT * 3.0, 45.0)
        ceiling = max_vuln_ceiling + 30.0
        normalized = min((raw_score / ceiling) * 100.0, 100.0)
        normalized = round(normalized, 2)

        risk_level = score_to_level(normalized)

        details = {
            "criticality_weight":   criticality_weight,
            "vuln_count":           len(vulns),
            "critical_vuln_count":  critical_count,
            "exploit_count":        exploit_count,
            "vulnerability_score":  round(vulnerability_score, 2),
            "threat_intel_score":   round(ti_component, 2),
            "exploit_bonus":        round(exploit_bonus, 2),
            "raw_score":            round(raw_score, 2),
            "normalized_score":     normalized,
            "ceiling_used":         round(ceiling, 2),
            "threat_composite_raw": round(threat_score, 2),
        }

        risk = RiskScore(
            asset_id            = asset.id,
            vulnerability_score = round(vulnerability_score, 2),
            threat_intel_score  = round(ti_component, 2),
            exploit_bonus       = round(exploit_bonus, 2),
            criticality_weight  = criticality_weight,
            raw_risk_score      = round(raw_score, 2),
            normalized_score    = normalized,
            risk_level          = risk_level,
            vuln_count          = len(vulns),
            critical_vuln_count = critical_count,
            exploit_count       = exploit_count,
            calculation_details = details,
        )
        db.add(risk)
        return risk

    # ── Enterprise-wide scoring ───────────────────────────────

    async def calculate_all_assets(
        self,
        db: AsyncSession,
    ) -> Dict[str, Any]:
        """Recalculate risk scores for all active assets using bulk operations for speed."""
        # 1. Fetch all active assets
        result = await db.execute(
            select(Asset).where(Asset.status == "active")
        )
        assets = result.scalars().all()
        if not assets:
            return {"enterprise_risk_score": 5.0, "assets_scored": 0}

        asset_ids = [a.id for a in assets]

        # 2. Bulk fetch all relevant vulnerabilities
        vuln_result = await db.execute(
            select(Vulnerability)
            .where(Vulnerability.asset_id.in_(asset_ids), Vulnerability.false_positive == False)
        )
        all_vulns = vuln_result.scalars().all()
        vulns_by_asset = {}
        for v in all_vulns:
            vulns_by_asset.setdefault(v.asset_id, []).append(v)

        # 3. Bulk fetch latest threat intel for each asset
        ti_result = await db.execute(
            select(ThreatIntel)
            .where(ThreatIntel.asset_id.in_(asset_ids))
            .distinct(ThreatIntel.asset_id)
            .order_by(ThreatIntel.asset_id, ThreatIntel.fetched_at.desc())
        )
        ti_by_asset = {t.asset_id: t for t in ti_result.scalars().all()}

        # 4. Process risk calculation for each asset (in-memory)
        scores = []
        for asset in assets:
            try:
                # We can reuse the calculation logic by passing the pre-fetched data
                # but for simplicity and to avoid breaking calculate_asset_risk signature,
                # we'll do the core logic here or refactor it slightly.
                # Actually, let's keep it simple and just run them concurrently for now 
                # if the queries are optimized. 
                # But wait, I've already fetched the data. Let's use it.
                
                asset_vulns = vulns_by_asset.get(asset.id, [])
                latest_ti = ti_by_asset.get(asset.id)
                
                # Perform calculation logic (sync part of calculate_asset_risk)
                risk = self._compute_risk_sync(asset, asset_vulns, latest_ti)
                db.add(risk)
                scores.append(float(risk.normalized_score))
            except Exception as e:
                logger.error("Risk calc failed for asset", ip=str(asset.ip_address), error=str(e))

        await db.flush()

        # Weighted Peak Average: Heavily prioritize the highest risks
        if not scores:
            enterprise_score = 5.0
        else:
            avg_score = sum(scores) / len(scores)
            max_score = max(scores)
            enterprise_score = round((max_score * 0.7) + (avg_score * 0.3), 2)
            enterprise_score = max(enterprise_score, 5.0)

        logger.info("Enterprise risk calculated (Optimized Bulk)", score=enterprise_score, asset_count=len(assets))
        return {
            "enterprise_risk_score": enterprise_score,
            "assets_scored":         len(scores),
            "max_asset_score":       max(scores) if scores else 0.0,
            "min_asset_score":       min(scores) if scores else 0.0,
        }

    def _compute_risk_sync(self, asset: Asset, vulns: List[Vulnerability], latest_ti: Optional[ThreatIntel]) -> RiskScore:
        """Synchronous part of risk calculation logic for bulk processing."""
        criticality_weight = CRITICALITY_WEIGHTS.get(asset.criticality.value, 1.5)
        threat_score = float(latest_ti.composite_threat_score) if latest_ti else 0.0

        vuln_raw_sum = 0.0
        exploit_count   = 0
        critical_count  = 0
        exploit_bonus   = 0.0

        for v in vulns:
            cvss = float(v.cvss_score or 0)
            multiplier = EXPLOIT_MULTIPLIER_PRESENT if v.exploit_available else EXPLOIT_MULTIPLIER_ABSENT
            vuln_raw_sum += cvss * multiplier

            if v.exploit_available:
                exploit_count  += 1
                exploit_bonus  += cvss * (EXPLOIT_MULTIPLIER_PRESENT - 1.0)
            if v.severity == SeverityLevel.critical:
                critical_count += 1

        vulnerability_score = vuln_raw_sum * criticality_weight
        ti_component = (threat_score / 100.0) * 30.0
        raw_score = vulnerability_score + ti_component

        max_vuln_ceiling = max(len(vulns) * 10 * EXPLOIT_MULTIPLIER_PRESENT * 3.0, 45.0)
        ceiling = max_vuln_ceiling + 30.0
        normalized = min((raw_score / ceiling) * 100.0, 100.0)
        normalized = round(normalized, 2)

        risk_level = score_to_level(normalized)

        details = {
            "criticality_weight":   criticality_weight,
            "vuln_count":           len(vulns),
            "critical_vuln_count":  critical_count,
            "exploit_count":        exploit_count,
            "vulnerability_score":  round(vulnerability_score, 2),
            "threat_intel_score":   round(ti_component, 2),
            "exploit_bonus":        round(exploit_bonus, 2),
            "raw_score":            round(raw_score, 2),
            "normalized_score":     normalized,
            "ceiling_used":         round(ceiling, 2),
            "threat_composite_raw": round(threat_score, 2),
        }

        return RiskScore(
            asset_id            = asset.id,
            vulnerability_score = round(vulnerability_score, 2),
            threat_intel_score  = round(ti_component, 2),
            exploit_bonus       = round(exploit_bonus, 2),
            criticality_weight  = criticality_weight,
            raw_risk_score      = round(raw_score, 2),
            normalized_score    = normalized,
            risk_level          = risk_level,
            vuln_count          = len(vulns),
            critical_vuln_count = critical_count,
            exploit_count       = exploit_count,
            calculation_details = details,
        )

    # ── Posture snapshot ──────────────────────────────────────

    async def take_posture_snapshot(self, db: AsyncSession) -> PostureHistory:
        """
        Create a dated snapshot of enterprise security posture.
        Called by scheduler daily, or manually.
        """
        today = date.today()
        
        # Standardized path for Docker volume persistence
        snapshot_dir = "/app/snapshots"
        os.makedirs(snapshot_dir, exist_ok=True)
        filename = f"snapshot_{today.isoformat()}.json"
        filepath = os.path.join(snapshot_dir, filename)

        # ── Fetch core data for metrics ──────────────────────────
        asset_res = await db.execute(select(Asset))
        all_assets = asset_res.scalars().all()
        active_assets = [a for a in all_assets if a.status.value == "active"]
        
        vuln_res = await db.execute(
            select(Vulnerability).where(Vulnerability.false_positive == False)
        )
        all_vulns = vuln_res.scalars().all()

        def count_by_severity(level: str) -> int:
            return sum(1 for v in all_vulns if v.severity.value == level)

        # Check if snapshot already exists for today
        existing_res = await db.execute(
            select(PostureHistory).where(PostureHistory.snapshot_date == today)
        )
        snapshot = existing_res.scalar_one_or_none()
        
        if not snapshot:
            logger.info("Initializing fresh posture snapshot for today", date=str(today))
            # ── Recalculate weights for snapshot ──────────────────
            risk_res = await db.execute(
                select(RiskScore)
                .distinct(RiskScore.asset_id)
                .order_by(RiskScore.asset_id, RiskScore.calculated_at.desc())
            )
            risk_records = risk_res.scalars().all()
            
            scores = [float(r.normalized_score) for r in risk_records]
            if not scores:
                enterprise_score = 5.0
            else:
                avg_score = sum(scores) / len(scores)
                max_score = max(scores)
                enterprise_score = round((max_score * 0.7) + (avg_score * 0.3), 2)
                enterprise_score = max(enterprise_score, 5.0)

            critical_risk_count = sum(1 for r in risk_records if r.risk_level.value == "critical")
            high_risk_count     = sum(1 for r in risk_records if r.risk_level.value == "high")

            # Top 5 threat IPs
            ti_res = await db.execute(
                select(ThreatIntel)
                .distinct(ThreatIntel.asset_id)
                .order_by(ThreatIntel.asset_id, ThreatIntel.fetched_at.desc())
            )
            ti_records = ti_res.scalars().all()
            top_threats = sorted(
                [{"ip": str(t.ip_address), "score": float(t.composite_threat_score)}
                 for t in ti_records],
                key=lambda x: x["score"], reverse=True
            )[:5]

            avg_cvss = 0.0
            scored_vulns = [v for v in all_vulns if v.cvss_score is not None]
            if scored_vulns:
                avg_cvss = round(sum(float(v.cvss_score) for v in scored_vulns) / len(scored_vulns), 2)

            snapshot = PostureHistory(
                snapshot_date               = today,
                enterprise_risk_score       = enterprise_score,
                total_assets                = len(all_assets),
                active_assets               = len(active_assets),
                total_vulnerabilities       = len(all_vulns),
                critical_vulnerabilities    = count_by_severity("critical"),
                high_vulnerabilities        = count_by_severity("high"),
                medium_vulnerabilities      = count_by_severity("medium"),
                low_vulnerabilities         = count_by_severity("low"),
                exploitable_vulns           = sum(1 for v in all_vulns if v.exploit_available),
                assets_at_critical_risk     = critical_risk_count,
                assets_at_high_risk         = high_risk_count,
                avg_cvss_score              = avg_cvss,
                top_threats                 = top_threats,
            )
            db.add(snapshot)
            await db.flush()
        else:
            logger.info("Updating existing posture snapshot metrics", date=str(today))
            enterprise_score    = float(snapshot.enterprise_risk_score)
            critical_risk_count = int(snapshot.assets_at_critical_risk)
            high_risk_count     = int(snapshot.assets_at_high_risk)
            avg_cvss            = float(snapshot.avg_cvss_score)
            top_threats         = snapshot.top_threats

        # Generate fresh JSON data to ensure file is synced (overwrites if present)
        snapshot_data = {
            "date": str(today),
            "enterprise_risk_score": enterprise_score,
            "total_assets": len(all_assets),
            "active_assets": len(active_assets),
            "total_vulnerabilities": len(all_vulns),
            "vulnerability_breakdown": {
                "critical": count_by_severity("critical"),
                "high": count_by_severity("high"),
                "medium": count_by_severity("medium"),
                "low": count_by_severity("low")
            },
            "exploitable_vulnerabilities": sum(1 for v in all_vulns if v.exploit_available),
            "assets_at_critical_risk": critical_risk_count,
            "assets_at_high_risk": high_risk_count,
            "avg_cvss_score": avg_cvss,
            "top_threats": top_threats,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        with open(filepath, "w") as f:
            json.dump(snapshot_data, f, indent=4)

        logger.info("Posture snapshot file synchronized", date=str(today), file=filepath)
        return snapshot, filepath


risk_engine = RiskScoringEngine()
