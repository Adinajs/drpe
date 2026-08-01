# backend/modules/orchestrator.py
import asyncio
import os
import structlog
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select, and_

from database import AsyncSessionLocal
from models import Asset, ScanStatus, Scan, AssetStatus
from modules.asset_discovery import discovery_engine
from modules.vuln_scanner import vuln_scanner
from config import settings

logger = structlog.get_logger()


class AdvancedOrchestrator:
    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone='UTC')
        self.is_running = False

    async def run_automated_pipeline(self):
        """
        The continuous End-to-End Scanning Loop:
        1. Run Nmap Discovery
        2. Identify Active Assets
        3. Dispatch OpenVAS Vulnerability Scans for targets lacking recent scans.
        (Scan fetching and posture updating is already automatically handled by main.py's poller!)
        """
        logger.info("Automation Orchestrator: Starting continuous pipeline loop")
        # Global Mission Start Log
        from models import ActivityLog
        async with AsyncSessionLocal() as db:
            db.add(ActivityLog(
                title="Global Reconnaissance Mission Started",
                details="Autonomous orchestrator initiated network-wide tactical sweep.",
                type="info"
            ))
            await db.commit()
        
        # ── Step 1: Discover Assets
        try:
            logger.info("Orchestrator: Initiating automated Nmap Discovery")
            async with AsyncSessionLocal() as db:
                discovered = await discovery_engine.scan_network(settings.SCAN_NETWORK_RANGE, settings.NMAP_FLAGS)
                await discovery_engine.persist_assets(db, discovered)
                await db.commit()
        except Exception as e:
            logger.error("Orchestrator: Discovery cycle failed", error=str(e))
            return  # Halt this cycle if discovery totally fails (e.g., no permissions)

        # ── Step 2: Trigger Vulnerability Scans for active assets
        try:
            async with AsyncSessionLocal() as db:
                # Find assets that were active and seen in the last 24h
                twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
                
                result = await db.execute(
                    select(Asset).where(
                        and_(
                            Asset.status == AssetStatus.active,
                            Asset.last_seen >= twenty_four_hours_ago
                        )
                    )
                )
                active_assets = result.scalars().all()
                
                dispatched_count = 0
                for asset in active_assets:
                    # check if there's already a scan running or recently created based on the interval
                    recent_threshold = datetime.now(timezone.utc) - timedelta(hours=settings.AUTOMATED_SCAN_INTERVAL_HOURS)
                    
                    # Log awareness of the node
                    db.add(ActivityLog(
                        title=f"Node Analysis: {asset.ip_address}",
                        details=f"Evaluating threat posture and scan freshness for logical node {asset.hostname or 'Generic Node'}.",
                        type="info"
                    ))
                    await db.flush()

                    scan_check = await db.execute(
                        select(Scan).where(
                            and_(
                                Scan.asset_id == asset.id,
                                Scan.created_at >= recent_threshold
                            )
                        ).limit(1)
                    )
                    recent_scan = scan_check.scalar_one_or_none()
                    
                    if not recent_scan:
                        logger.info("Orchestrator: Dispatching GVM Scan for asset", ip=asset.ip_address)
                        # Specific notification for dispatch
                        db.add(ActivityLog(
                            title=f"Tactical Scan Dispatched: {asset.ip_address}",
                            details=f"Command broadcasted to GVM agent for deep vulnerability inspection on {asset.ip_address}.",
                            type="info"
                        ))
                        await db.flush()

                        try:
                            await vuln_scanner.start_scan_for_asset(
                                db=db,
                                asset_ip=str(asset.ip_address),
                                scan_name=f"Auto-Scan-{asset.ip_address}-{datetime.now().strftime('%Y%m%d')}"
                            )
                            # Ensure we don't bombard GVM api concurrently
                            await asyncio.sleep(1) # Slightly faster for demo
                            dispatched_count += 1
                        except Exception as scan_err:
                            logger.error("Orchestrator: Failed to dispatch scan for asset", ip=asset.ip_address, error=str(scan_err))
                
                await db.commit()
                # Global Mission Completion Log
                from models import ActivityLog
                db.add(ActivityLog(
                    title="Mission Dispatch Phase Complete",
                    details=f"Orchestrator successfully scrutinized node inventory. {dispatched_count} active targets assigned for deep scanning.",
                    type="success"
                ))
                await db.commit()
                
                logger.info("Orchestrator: Pipeline dispatch phase complete", new_scans_dispatched=dispatched_count)
                        
        except Exception as e:
            logger.error("Orchestrator: Vulnerability scanning dispatch failed", error=str(e))

    def start(self):
        if not self.is_running:
            interval_hours = settings.AUTOMATED_SCAN_INTERVAL_HOURS
            
            # Use APScheduler to run the background loop
            self.scheduler.add_job(
                self.run_automated_pipeline,
                'interval',
                hours=interval_hours,
                id='continuous_pipeline_job',
                replace_existing=True,
                # Start the first run 20 seconds after the app boots
                next_run_time=datetime.now(timezone.utc) + timedelta(seconds=20) 
            )
            self.scheduler.start()
            self.is_running = True
            logger.info("Advanced Automation Orchestrator Background Loop Started", interval_hours=interval_hours)

    def shutdown(self):
        if self.is_running:
            self.scheduler.shutdown()
            self.is_running = False
            logger.info("Advanced Automation Orchestrator shut down")


orchestrator = AdvancedOrchestrator()
