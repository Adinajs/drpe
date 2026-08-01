import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models import Asset, Vulnerability, RiskScore, PostureHistory, AssetCriticality, AssetStatus, SeverityLevel
import uuid
from datetime import datetime, date

async def seed_data():
    async with AsyncSessionLocal() as db:
        print("Seeding dummy assets...")
        # 1. Assets
        a1 = Asset(id=uuid.uuid4(), ip_address="192.168.1.10", hostname="Web-Prod", criticality=AssetCriticality.critical, status=AssetStatus.active)
        a2 = Asset(id=uuid.uuid4(), ip_address="192.168.1.15", hostname="DB-Main", criticality=AssetCriticality.high, status=AssetStatus.active)
        a3 = Asset(id=uuid.uuid4(), ip_address="192.168.1.20", hostname="Dev-Ops", criticality=AssetCriticality.medium, status=AssetStatus.active)
        
        db.add_all([a1, a2, a3])
        await db.commit()

        print("Seeding dummy vulnerabilities...")
        # 2. Vulnerabilities
        v1 = Vulnerability(scan_id=uuid.uuid4(), asset_id=a1.id, name="Log4j RCE", severity=SeverityLevel.critical, cvss_score=10.0, false_positive=False, exploit_available=True)
        v2 = Vulnerability(scan_id=uuid.uuid4(), asset_id=a1.id, name="Outdated Nginx", severity=SeverityLevel.medium, cvss_score=5.3, false_positive=False)
        v3 = Vulnerability(scan_id=uuid.uuid4(), asset_id=a2.id, name="Postgres misconfig", severity=SeverityLevel.high, cvss_score=8.5, false_positive=False)
        
        db.add_all([v1, v2, v3])
        await db.commit()

        print("Seeding dummy risk scores...")
        # 3. Risk Scores
        rs1 = RiskScore(asset_id=a1.id, normalized_score=9.5, risk_level=SeverityLevel.critical)
        rs2 = RiskScore(asset_id=a2.id, normalized_score=7.2, risk_level=SeverityLevel.high)
        rs3 = RiskScore(asset_id=a3.id, normalized_score=2.0, risk_level=SeverityLevel.low)

        db.add_all([rs1, rs2, rs3])
        await db.commit()

        print("Seeding dummy posture history...")
        # 4. Posture
        ph1 = PostureHistory(snapshot_date=date.today(), enterprise_risk_score=6.8, total_assets=3, active_assets=3, total_vulnerabilities=3)
        db.add(ph1)
        await db.commit()
        
        print("Demo data successfully injected!")

if __name__ == "__main__":
    asyncio.run(seed_data())
