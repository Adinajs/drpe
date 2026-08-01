# backend/modules/predictive_engine.py
# =============================================================
# Predictive Risk Intelligence Engine
# Traditional Least Squares Regression for Posture Forecasting
# =============================================================
import structlog
from datetime import date, timedelta
from typing import List, Dict, Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from models import PostureHistory

logger = structlog.get_logger()

class PredictiveEngine:
    """
    Analyzes historical security posture to forecast future risk trends.
    Uses pure-Python least squares regression to avoid heavy dependencies.
    """

    async def get_risk_forecast(self, db: AsyncSession, days_ahead: int = 7) -> Dict[str, Any]:
        """
        Fetch historical data and compute a 7-day forecast.
        """
        # 1. Fetch last 30 days of history
        thirty_days_ago = date.today() - timedelta(days=30)
        result = await db.execute(
            select(PostureHistory)
            .where(PostureHistory.snapshot_date >= thirty_days_ago)
            .order_by(PostureHistory.snapshot_date)
        )
        history = result.scalars().all()

        if len(history) < 2:
            return {
                "forecast": [],
                "confidence": "low",
                "message": "Insufficient historical data for accurate forecasting (need at least 2 points)."
            }

        # 2. Prepare data for linear regression
        # x = days from start_date, y = enterprise_risk_score
        start_date = history[0].snapshot_date
        x_data = [(h.snapshot_date - start_date).days for h in history]
        y_data = [float(h.enterprise_risk_score) for h in history]
        n = len(x_data)

        # 3. Calculate Least Squares Regression
        # y = mx + b
        sum_x  = sum(x_data)
        sum_y  = sum(y_data)
        sum_xx = sum(x**2 for x in x_data)
        sum_xy = sum(x*y for x, y in zip(x_data, y_data))

        denominator = (n * sum_xx - sum_x**2)
        if denominator == 0:
            m = 0
        else:
            m = (n * sum_xy - sum_x * sum_y) / denominator
        
        b = (sum_y - m * sum_x) / n

        # 4. Generate Forecast
        last_day_index = x_data[-1]
        forecast_points = []
        current_score = y_data[-1]
        
        for i in range(1, days_ahead + 1):
            target_date = date.today() + timedelta(days=i)
            target_x = (target_date - start_date).days
            predicted_y = max(0, min(100, m * target_x + b))
            forecast_points.append({
                "date": target_date.isoformat(),
                "score": round(predicted_y, 2)
            })

        # 5. Trend Analysis
        breach_probability = "low"
        last_forecast = forecast_points[-1]["score"]
        
        # If risk is predicted to rise significantly (>20%)
        if last_forecast > current_score * 1.2 and last_forecast > 30:
            breach_probability = "high"
        elif last_forecast > current_score:
            breach_probability = "medium"

        return {
            "historical_last_30_days": [
                {"date": h.snapshot_date.isoformat(), "score": float(h.enterprise_risk_score)}
                for h in history
            ],
            "forecast": forecast_points,
            "trend_metadata": {
                "slope": round(m, 4),
                "intercept": round(b, 2),
                "breach_probability": breach_probability,
                "projected_7d_change": round(last_forecast - current_score, 2)
            },
            "confidence": "high" if n > 7 else "medium"
        }

    async def get_network_topology(self, db: AsyncSession) -> Dict[str, Any]:
        """
        Generates a node-link model of the network for graph visualization.
        """
        from models import Asset, RiskScore
        from sqlalchemy import desc, func

        subq_risk = (
            select(RiskScore.asset_id, func.max(RiskScore.calculated_at).label("latest"))
            .group_by(RiskScore.asset_id)
            .subquery()
        )
        # Fetch active assets with latest risk scores
        result = await db.execute(
            select(Asset, RiskScore)
            .join(RiskScore, RiskScore.asset_id == Asset.id)
            .join(subq_risk, (RiskScore.asset_id == subq_risk.c.asset_id) & (RiskScore.calculated_at == subq_risk.c.latest))
            .where(Asset.status == "active")
            .order_by(desc(RiskScore.normalized_score))
        )
        rows = result.all()

        nodes = []
        links = []
        
        # Group by subnet (first 3 octets) for logical linking
        subnets = {}

        for asset, rs in rows:
            ip = str(asset.ip_address)
            nodes.append({
                "id": ip,
                "name": asset.hostname or ip,
                "val": float(rs.normalized_score), # Size of node
                "risk_level": rs.risk_level.value,
                "criticality": asset.criticality.value,
                "os": asset.os_detected,
                "ports": asset.open_ports
            })

            subnet = ".".join(ip.split(".")[:3])
            if subnet not in subnets:
                subnets[subnet] = []
            subnets[subnet].append(ip)

        # Create links within subnets to simulate network locality
        for subnet_ips in subnets.values():
            if len(subnet_ips) > 1:
                # Link everything to the first one in the subnet (star topology for visualization)
                root = subnet_ips[0]
                for other in subnet_ips[1:]:
                    links.append({"source": root, "target": other, "value": 1})

        return {
            "nodes": nodes,
            "links": links
        }

predictive_engine = PredictiveEngine()
