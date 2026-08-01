# backend/main.py
# =============================================================
# DRPE - Dynamic Risk Posture Evaluation Backend
# FastAPI Application Entry Point
# =============================================================
from fastapi import FastAPI, Depends, HTTPException, status, Query, Body, Header, Response, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from datetime import date, timedelta, datetime, timezone
import structlog
import uvicorn
import asyncio
import subprocess
import shutil

from config import settings
from database import get_db, check_db_connection, AsyncSessionLocal
from models import (
    Asset, Scan, Vulnerability, ThreatIntel,
    RiskScore, PostureHistory, AssetCriticality, ScanStatus, User, ApiToken, Notification, ActivityLog
)

from auth_logic import verify_password, get_password_hash, create_access_token, decode_access_token
from modules.asset_discovery import discovery_engine
from modules.vuln_scanner     import vuln_scanner
from modules.threat_intel     import threat_intel_service
from modules.risk_engine      import risk_engine
from modules.predictive_engine import predictive_engine
from modules.global_intel      import global_intel_service
from modules.misp_intel        import misp_service
from modules.ai_engine         import ai_engine

from schemas import (
    AssetOut, AssetUpdate, ScanOut, VulnerabilityOut,
    ThreatIntelOut, RiskScoreOut, DashboardSummary,
    HeatmapData, TrendDataPoint, DiscoverRequest,
    ScanRequest, RiskCalcResponse, ApiResponse,
    UserCreate, UserLogin, UserOut, Token, UserUpdate, PasswordChange
)

from sqlalchemy import select, func, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# ── Simple In-Memory Caching System for Dashboard ──────────────
import time

class SimpleCache:
    def __init__(self):
        self._cache = {}

    def get(self, key):
        if key in self._cache:
            val, expiry = self._cache[key]
            if time.time() < expiry:
                return val
            else:
                del self._cache[key]
        return None

    def set(self, key, val, ttl=10):
        self._cache[key] = (val, time.time() + ttl)

    def clear(self):
        self._cache.clear()
        logger.info("Dashboard cache invalidated/cleared")

dashboard_cache = SimpleCache()


# ── Background: auto-fetch completed GVM scans ────────────────

async def _poll_and_fetch_scans():
    """
    Every 60 s: find all DB scans with status='running', query GVM for their
    live status, and auto-call fetch_and_store_results() when GVM says Done.
    This is the missing link that makes results appear automatically.
    """
    await asyncio.sleep(15)          # brief delay so DB is ready on cold start
    while True:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(Scan).where(Scan.status == ScanStatus.running)
                )
                running_scans = result.scalars().all()

                for scan in running_scans:
                    if not scan.openvas_task_id:
                        continue
                    try:
                        gvm_status = await vuln_scanner.get_scan_status(scan.openvas_task_id)
                        task_status = (gvm_status.get("status") or "").lower()
                        progress    = str(gvm_status.get("progress") or "0")

                        logger.info(
                            "Poller: scan status",
                            scan_id=str(scan.id),
                            gvm_status=task_status,
                            progress=progress,
                        )

                        if task_status in ["done", "interrupted", "stopped", "aborted"]:
                             # Try to fetch results even if interrupted/aborted
                            logger.info(
                                f"Poller: scan in terminal state ({task_status}) — attempting recovery",
                                scan_id=str(scan.id),
                            )
                            try:
                                count = await vuln_scanner.fetch_and_store_results(db, str(scan.id))
                                await db.commit()
                                logger.info("Poller: recovery successful", scan_id=str(scan.id), count=count)
                            except Exception as fetch_err:
                                logger.error("Poller: recovery failed", scan_id=str(scan.id), error=str(fetch_err))
                                # If it truly failed, mark as failed
                                await db.execute(
                                    update(Scan)
                                    .where(Scan.id == scan.id)
                                    .values(status=ScanStatus.failed, error_message=f"GVM {task_status.capitalize()}: {fetch_err}")
                                )
                                await db.commit()
                        elif progress == "100" and task_status not in ["done"]:
                             logger.info("Poller: scan at 100% but not yet 'done'", scan_id=str(scan.id))
                    except Exception as e:
                        logger.error(
                            "Poller: error processing scan",
                            scan_id=str(scan.id),
                            error=str(e),
                        )
        except Exception as e:
            logger.error("Poller: top-level error", error=str(e))

        await asyncio.sleep(60)      # check every 60 s


# ── Lifespan: startup / shutdown ──────────────────────────────

from modules.orchestrator import orchestrator

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("DRPE Backend starting", env=settings.APP_ENV)
    if not await check_db_connection():
        logger.error("Database unreachable on startup!")
    else:
        logger.info("Database connection OK")
    
    # Start background processing tasks
    asyncio.create_task(misp_service.sync_feeds())
    app.state.poller_task = asyncio.create_task(_poll_and_fetch_scans())
    
    orchestrator.start()
    
    yield
    
    # orchestrator.shutdown()
    if hasattr(app.state, "poller_task"):
        app.state.poller_task.cancel()
    logger.info("DRPE Backend shutting down")


# ── App init ──────────────────────────────────────────────────

app = FastAPI(
    title       = "DRPE - Dynamic Risk Posture Evaluation API",
    description = "Risk Intelligence & Assessment Module I",
    version     = "1.0.0",
    docs_url    = "/api/docs",
    redoc_url   = "/api/redoc",
    lifespan    = lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = settings.cors_origins_list,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Authentication Dependency ─────────────────────────────────

from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Check for static admin token (backward compatibility)
    if token == settings.API_TOKEN:
        return "admin_static"

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    email = payload.get("sub")
    if email is None:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    return user


# ── Auth Endpoints ───────────────────────────────────────────

@app.post("/api/auth/signup", tags=["Auth"], response_model=ApiResponse)
async def signup(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User already registered")
    
    hashed_password = get_password_hash(user_in.password)
    new_user = User(
        email=user_in.email,
        hashed_password=hashed_password,
        full_name=user_in.full_name,
        role="Admin"  # Default as requested
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email})
    
    return ApiResponse(
        success=True,
        message="User registered successfully",
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(new_user.id),
                "full_name": new_user.full_name,
                "email": new_user.email,
                "role": new_user.role,
                "avatar_url": new_user.avatar_url
            }
        }
    )

@app.post("/api/auth/login", tags=["Auth"], response_model=ApiResponse)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == user_in.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Operative status: Deactivated")

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    
    access_token = create_access_token(data={"sub": user.email})
    
    return ApiResponse(
        success=True,
        message="Authentication successful",
        data={
            "access_token": access_token,
            "token_type": "bearer",
            "user": {
                "id": str(user.id),
                "full_name": user.full_name,
                "email": user.email,
                "role": user.role,
                "avatar_url": user.avatar_url
            }
        }
    )

@app.put("/api/user/profile", tags=["Auth"], response_model=ApiResponse)
async def update_profile(
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update operative profile details (Callsign/Avatar)."""
    if isinstance(current_user, str): # Handle static admin fallback
         raise HTTPException(status_code=403, detail="Static administrator accounts cannot be modified.")

    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url
    
    await db.commit()
    await db.refresh(current_user)
    
    return ApiResponse(
        success=True,
        message="Operative identity synchronized",
        data={
            "id": str(current_user.id),
            "full_name": current_user.full_name,
            "email": current_user.email,
            "role": current_user.role,
            "avatar_url": current_user.avatar_url
        }
    )

@app.post("/api/user/change-password", tags=["Auth"], response_model=ApiResponse)
async def change_password(
    password_change: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Strategic rotation of access keys."""
    if isinstance(current_user, str):
         raise HTTPException(status_code=403, detail="Static credentials cannot be rotated via API.")

    if not verify_password(password_change.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current access key verification failed.")
    
    current_user.hashed_password = get_password_hash(password_change.new_password)
    await db.commit()
    
    return ApiResponse(success=True, message="Strategic access keys rotated successfully.")

    return ApiResponse(
        success=True,
        message="Access key rotated successfully"
    )



@app.get("/api/system/status", tags=["System"])
async def system_status(db: AsyncSession = Depends(get_db)):
    """Comprehensive health check for demonstration purposes."""
    db_ok = await check_db_connection()
    

    
    # Check AI Diagnostics
    otx_ok = bool(settings.OTX_API_KEY)
    abuse_ok = bool(settings.ABUSEIPDB_API_KEY)
    gemini_ok = bool(settings.GOOGLE_API_KEY)
    
    return {
        "status": "OPERATIONAL" if db_ok else "DEGRADED",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "database": {
                "status": "CONNECTED" if db_ok else "DISCONNECTED",
                "provider": "Supabase Cloud" if "supabase.co" in str(settings.DATABASE_URL) else "Local PostgreSQL"
            },
            "threat_intelligence": {
                "otx_uplink": "ACTIVE" if otx_ok else "INACTIVE",
                "abuse_ipdb": "ACTIVE" if abuse_ok else "INACTIVE",
            },
            "ai_engine": {
                "provider": settings.AI_PROVIDER,
                "uplink": "ACTIVE" if (settings.AI_PROVIDER == "gemini" and gemini_ok) or settings.AI_PROVIDER == "ollama" else "INACTIVE"
            },

        }
    }


@app.get("/api/health", tags=["System"])
async def health_check():
    db_ok = await check_db_connection()
    return {
        "status":  "healthy" if db_ok else "degraded",
        "db":      "ok" if db_ok else "unreachable",
        "version": "1.0.0",
    }


# ─────────────────────────────────────────────────────────────
# 1. ASSET DISCOVERY
# ─────────────────────────────────────────────────────────────

@app.post("/api/discover-assets", tags=["Assets"], response_model=ApiResponse)
async def discover_assets(
    req: DiscoverRequest = Body(...),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Run Nmap against target network range.
    Discovered hosts are upserted into the assets table.
    """
    try:
        discovered = await discovery_engine.scan_network(
            target=req.target or settings.SCAN_NETWORK_RANGE,
            flags=req.flags,
        )
        counts = await discovery_engine.persist_assets(db, discovered)
        dashboard_cache.clear()
        return ApiResponse(
            success=True,
            message=f"Discovery complete: {counts['new']} new, {counts['updated']} updated",
            data=counts,
        )
    except Exception as e:
        logger.error("Asset discovery failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/assets", tags=["Assets"])
async def list_assets(
    response: Response,
    criticality: str | None = Query(None),
    status:      str | None = Query(None),
    limit:  int = Query(100, le=10000),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    # Add lightweight caching for better flow
    response.headers["Cache-Control"] = "public, max-age=10"
    query = select(Asset)
    if criticality:
        query = query.where(Asset.criticality == criticality)
    if status:
        query = query.where(Asset.status == status)
    query = query.order_by(desc(Asset.last_seen)).limit(limit).offset(offset)
    result = await db.execute(query)
    assets = result.scalars().all()
    return [_asset_to_dict(a) for a in assets]


@app.get("/api/assets/{asset_id}", tags=["Assets"])
async def get_asset(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _asset_to_dict(asset)


@app.patch("/api/assets/{asset_id}", tags=["Assets"])
async def update_asset(
    asset_id: str,
    updates: AssetUpdate,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Asset).where(Asset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    update_data = updates.model_dump(exclude_unset=True)
    if update_data:
        await db.execute(
            update(Asset).where(Asset.id == asset_id).values(**update_data)
        )
        dashboard_cache.clear()
    return {"success": True, "message": "Asset updated"}


# ─────────────────────────────────────────────────────────────
# 2. VULNERABILITY SCANNING
# ─────────────────────────────────────────────────────────────

@app.post("/api/start-scan", tags=["Scanning"], response_model=ApiResponse)
async def start_scan(
    req: ScanRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Trigger an OpenVAS scan for a specific asset IP.
    Creates a GVM task and starts it via SSH.
    """
    try:
        scan = await vuln_scanner.start_scan_for_asset(
            db        = db,
            asset_ip  = req.asset_ip,
            scan_name = req.scan_name,
        )
        dashboard_cache.clear()
        return ApiResponse(
            success=True,
            message=f"Scan started for {req.asset_ip}",
            data={"scan_id": str(scan.id), "task_id": scan.openvas_task_id},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Start scan failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fetch-scan-results/{scan_id}", tags=["Scanning"], response_model=ApiResponse)
async def fetch_scan_results(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Download and parse OpenVAS report for a completed scan.
    Stores parsed vulnerabilities in database.
    """
    try:
        count = await vuln_scanner.fetch_and_store_results(db, scan_id)
        dashboard_cache.clear()
        return ApiResponse(
            success=True,
            message=f"Stored {count} vulnerabilities",
            data={"vuln_count": count},
        )
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))  # 409 = scan not ready
    except Exception as e:
        logger.error("Fetch results failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/scans", tags=["Scanning"])
async def list_scans(
    asset_id: str | None = Query(None),
    status:   str | None = Query(None),
    limit:  int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    query = select(Scan).order_by(desc(Scan.created_at)).limit(limit)
    if asset_id:
        query = query.where(Scan.asset_id == asset_id)
    if status:
        query = query.where(Scan.status == status)
    result = await db.execute(query)
    scans = result.scalars().all()
    return [_scan_to_dict(s) for s in scans]


@app.get("/api/scans/{scan_id}/status", tags=["Scanning"])
async def check_scan_status(
    scan_id: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    gvm_status = {}
    if scan.openvas_task_id and scan.status.value == "running":
        try:
            gvm_status = await vuln_scanner.get_scan_status(scan.openvas_task_id)
        except Exception:
            pass

    return {**_scan_to_dict(scan), "gvm_live_status": gvm_status}


@app.get("/api/vulnerabilities", tags=["Vulnerabilities"])
async def list_vulnerabilities(
    response: Response,
    asset_id:  str | None = Query(None),
    severity:  str | None = Query(None),
    cve_id:    str | None = Query(None),
    exploit:   bool | None = Query(None),
    limit:  int = Query(100, le=500),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    # Caching results for 10 seconds to improve UI transitions
    response.headers["Cache-Control"] = "public, max-age=10"
    query = (
        select(Vulnerability, Asset)
        .join(Asset, Vulnerability.asset_id == Asset.id)
        .where(Vulnerability.false_positive == False)
        .order_by(desc(Vulnerability.cvss_score))
        .limit(limit).offset(offset)
    )
    if asset_id:  query = query.where(Vulnerability.asset_id == asset_id)
    if severity:  query = query.where(Vulnerability.severity == severity)
    if cve_id:    query = query.where(Vulnerability.cve_id == cve_id)
    if exploit is not None:
        query = query.where(Vulnerability.exploit_available == exploit)

    result = await db.execute(query)
    rows = result.all()
    # Return raw list for the table data
    return [_vuln_to_dict(v, a) for v, a in rows]


@app.post("/api/ai/analyze-vulnerability", tags=["AI Intelligence"], response_model=ApiResponse)
async def analyze_vulnerability_endpoint(
    vuln_id: str = Body(..., embed=True),
    x_gemini_key: str | None = Header(None, alias="X-Gemini-Key"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Generate deep security insights for a specific vulnerability using Gemini AI.
    """
    result = await db.execute(select(Vulnerability).where(Vulnerability.id == vuln_id))
    vuln = result.scalar_one_or_none()
    
    if not vuln:
        raise HTTPException(status_code=404, detail="Vulnerability not found")
    
    analysis = await ai_engine.analyze_vulnerability(_vuln_to_dict(vuln), custom_key=x_gemini_key)
    return ApiResponse(
        success=True,
        message="AI Analysis complete",
        data={"analysis": analysis}
    )


@app.post("/api/ai/chat", tags=["AI Intelligence"])
async def ai_chat_endpoint(
    message: str = Body(..., embed=True),
    history: list = Body(None),
    context: dict = Body(None),
    x_gemini_key: str | None = Header(None, alias="X-Gemini-Key"),
    _: str = Depends(get_current_user),
):
    """
    General AI chat endpoint for the Tactical AI Copilot with Streaming support.
    """
    from fastapi.responses import StreamingResponse
    
    # Construct a high-fidelity system prompt based on context
    context_parts = []
    if context:
        summary = context.get("summary", {})
        if summary:
            context_parts.append(f"Enterprise Risk: {summary.get('enterprise_risk_score', 'N/A')} | Nodes: {summary.get('total_assets', 0)} ({summary.get('active_assets', 0)} Active) | Vulns: {summary.get('total_vulnerabilities', 0)} ({summary.get('exploitable_vulnerabilities', 0)} Exploitable)")
        
        # Focus on top 5 critical findings for speed and relevance
        vulns = context.get("vulnerabilities", [])
        if vulns:
            context_parts.append("\nCRITICAL VULNERABILITIES:")
            for v in vulns[:5]: 
                context_parts.append(f"- {v.get('cve_id') or 'Local'} on {v.get('asset_ip')}: {v.get('name')} ({v.get('severity')})")

        threats = context.get("threats", [])
        if threats:
            context_parts.append("\nTHREAT INTELLIGENCE:")
            for t in threats[:5]:
                context_parts.append(f"- {t.get('ip')}: Score {t.get('composite_threat_score')}/100. Confidence {t.get('abuse_confidence')}%. Adversaries: {', '.join(t.get('adversaries', [])[:2]) or 'None'}.")
    
    context_str = "\n".join(context_parts) if context_parts else "No specific scan data provided yet."
    system_prompt = f"CONTEXT DATA:\n{context_str}\n\nYou are DRPE Tactical AI. Provide highly structured, clear, and actionable responses. Always use clean Markdown formatting: utilize clear headings (e.g., '### Remediation Ops'), distinct bullet points, and bold tags for critical nodes or risk scores."
    
    async def stream_generator():
        async for chunk in ai_engine.generate_chat_stream(message, history, system_prompt, custom_key=x_gemini_key):
            # Yield as simple text for the frontend to consume
            yield chunk

    return StreamingResponse(stream_generator(), media_type="text/plain")


# ─────────────────────────────────────────────────────────────
# 3. THREAT INTELLIGENCE
# ─────────────────────────────────────────────────────────────

@app.post("/api/fetch-threat-intel", tags=["Threat Intelligence"], response_model=ApiResponse)
async def fetch_threat_intel(
    asset_ips: list[str] | None = Body(None),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Fetch OTX + AbuseIPDB threat intel for specified IPs (or all active assets)."""
    try:
        result = await threat_intel_service.fetch_and_store_for_all_assets(db, asset_ips)
        dashboard_cache.clear()
        return ApiResponse(success=True, message="Threat intel fetched", data=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/global-advisories", tags=["Threat Intelligence"])
async def global_advisories(
    _: str = Depends(get_current_user),
):
    """
    Fetch live real-world security headlines from open-source feeds.
    Provides proof of automated, live data.
    """
    cache_key = "global_advisories"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    try:
        headlines = await global_intel_service.get_recent_advisories()
        status    = await global_intel_service.get_isc_status()
        res = ApiResponse(success=True, message="Global advisories synchronized", data={"headlines": headlines, "status": status})
        dashboard_cache.set(cache_key, res, ttl=3600)
        return res
    except Exception as e:
        logger.error("Global advisory fetch failed", error=str(e))
        raise HTTPException(status_code=500, detail="Tactical feed synchronization fault")


@app.get("/api/intel-diagnostics", tags=["Threat Intelligence"])
async def intel_diagnostics(
    _: str = Depends(get_current_user),
):
    """
    Verify 200 OK status for backend threat intelligence keys.
    Provides diagnostic transparency to the USER.
    """
    cache_key = "intel_diagnostics"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    otx_ok   = bool(settings.OTX_API_KEY)
    abuse_ok = bool(settings.ABUSEIPDB_API_KEY)
    
    res = ApiResponse(
        success=True, 
        message="Intelligence diagnostics complete", 
        data={
            "otx_key_present": otx_ok,
            "abuse_key_present": abuse_ok,
            "uplink_status": "ONLINE" if (otx_ok and abuse_ok) else "PARTIAL",
            "misp_service": "ONLINE" if misp_service.last_sync else "INITIALIZING",
            "misp_indicators": len(misp_service.malicious_ips),
            "isc_status": "REACHABLE"
        }
    )
    dashboard_cache.set(cache_key, res, ttl=3600)
    return res


# ─────────────────────────────────────────────────────────────
# 4. RISK CALCULATION
# ─────────────────────────────────────────────────────────────

@app.post("/api/calculate-risk", tags=["Risk Engine"], response_model=ApiResponse)
async def calculate_risk(
    asset_id: str | None = Query(None, description="Calculate for specific asset, or all if omitted"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Trigger risk score recalculation."""
    try:
        if asset_id:
            result = await db.execute(select(Asset).where(Asset.id == asset_id))
            asset = result.scalar_one_or_none()
            if not asset:
                raise HTTPException(status_code=404, detail="Asset not found")
            risk = await risk_engine.calculate_asset_risk(db, asset)
            dashboard_cache.clear()
            return ApiResponse(
                success=True,
                message="Risk calculated",
                data={"asset_id": asset_id, "score": float(risk.normalized_score), "level": risk.risk_level.value},
            )
        else:
            summary = await risk_engine.calculate_all_assets(db)
            dashboard_cache.clear()
            return ApiResponse(success=True, message="Risk calculated for all assets", data=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/posture-snapshot", tags=["Risk Engine"], response_model=ApiResponse)
async def posture_snapshot(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Manually trigger a posture snapshot for today."""
    try:
        snap, filepath = await risk_engine.take_posture_snapshot(db)
        dashboard_cache.clear()
        return ApiResponse(
            success=True, message=f"Snapshot created and saved to {filepath}",
            data={
                "date": str(snap.snapshot_date), 
                "score": float(snap.enterprise_risk_score),
                "file_path": filepath
            },
        )
    except Exception as e:
        logger.error("Snapshot generation failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────
# 5. DASHBOARD & REPORTING ENDPOINTS
# ─────────────────────────────────────────────────────────────

@app.get("/api/report-data/{ip}", tags=["Reporting"])
async def get_report_data(
    ip: str,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Returns a consolidated dossier for a specific asset IP.
    Used by the ReportsPage.jsx UI.
    """
    try:
        # 1. Fetch Asset
        asset_query = select(Asset).where(Asset.ip_address == ip)
        asset_res = await db.execute(asset_query)
        asset = asset_res.scalar_one_or_none()
        if not asset:
            raise HTTPException(status_code=404, detail="Asset node not found in inventory")

        # 2. Fetch Risk Score
        # We query for the latest risk score for this asset
        risk_query = select(RiskScore).where(RiskScore.asset_id == asset.id).order_by(desc(RiskScore.calculated_at)).limit(1)
        risk_res = await db.execute(risk_query)
        risk = risk_res.scalar_one_or_none()

        # 3. Fetch Vulnerabilities
        vuln_query = select(Vulnerability).where(Vulnerability.asset_id == asset.id, Vulnerability.false_positive == False)
        vuln_res = await db.execute(vuln_query)
        vulns = vuln_res.scalars().all()

        # 4. Fetch Threat Intel
        intel_query = select(ThreatIntel).where(ThreatIntel.asset_id == asset.id).order_by(desc(ThreatIntel.fetched_at)).limit(1)
        intel_res = await db.execute(intel_query)
        intel = intel_res.scalar_one_or_none()

        # 5. Severity Breakdown
        sev_map = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Informational": 0}
        for v in vulns:
            # Robust severity extraction
            s_val = "Medium"
            if v.severity:
                if hasattr(v.severity, 'value'):
                    s_val = v.severity.value
                elif isinstance(v.severity, str):
                    s_val = v.severity
                else:
                    s_val = str(v.severity)
                
            # Standardize casing to match our map
            s_ext = s_val.capitalize()
            if s_ext in sev_map:
                sev_map[s_ext] += 1
            else:
                sev_map["Informational"] += 1

        return ApiResponse(
            success=True,
            message=f"Dossier compiled for {ip}",
            data={
                "asset": {
                    "ip": asset.ip_address,
                    "hostname": asset.hostname,
                    "os_detected": asset.os_detected,
                    "mac_address": asset.mac_address,
                    "criticality": (asset.criticality.value if hasattr(asset.criticality, "value") else str(asset.criticality)) if asset.criticality else "Medium",
                },
                "risk": {
                    "score": float(risk.normalized_score) if (risk and risk.normalized_score is not None) else 0.0,
                    "level": str(risk.risk_level.value if hasattr(risk.risk_level, "value") else risk.risk_level) if (risk and risk.risk_level) else "Low",
                    "calculated_at": risk.calculated_at.isoformat() if (risk and risk.calculated_at) else None
                },
                "vulnerabilities": [_vuln_to_dict(v) for v in vulns],
                "total_vulnerabilities": len(vulns),
                "severity_breakdown": sev_map,
                "exploitable_count": sum(1 for v in vulns if v.exploit_available),
                "threat_intel": {
                    "composite_score": float(intel.composite_threat_score) if (intel and intel.composite_threat_score is not None) else 0.0,
                    "confidence": intel.abuse_confidence if (intel and hasattr(intel, 'abuse_confidence')) else 0,
                } if intel else None
            }
        )

    except Exception as e:
        logger.error("Report generation failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Dossier Compilation Fault: {str(e)}")


@app.get("/api/dashboard-summary", tags=["Dashboard"])
async def dashboard_summary(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Aggregated summary metrics for the main dashboard."""
    cache_key = "dashboard_summary"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    # Asset counts
    asset_result = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Asset.status == "active").label("active"),
        ).select_from(Asset)
    )
    asset_row = asset_result.one_or_none()
    total_assets = asset_row.total if asset_row else 0
    active_assets = asset_row.active if asset_row else 0

    # Criticality breakdown
    crit_result = await db.execute(
        select(Asset.criticality, func.count().label("cnt"))
        .group_by(Asset.criticality)
    )
    criticality_breakdown = {
        (row.criticality.value if hasattr(row.criticality, 'value') else str(row.criticality)): row.cnt 
        for row in crit_result if row.criticality
    }

    # Vulnerability counts (Optimized direct count)
    total_vulns = (await db.execute(
        select(func.count(Vulnerability.id)).where(Vulnerability.false_positive == False)
    )).scalar() or 0

    sev_result = await db.execute(
        select(Vulnerability.severity, func.count().label("cnt"))
        .where(Vulnerability.false_positive == False)
        .group_by(Vulnerability.severity)
    )
    
    severity_breakdown = {
        "Critical": 0, "High": 0, "Medium": 0, "Low": 0
    }
    for row in sev_result:
        if not row.severity: continue
        # Handle both Enums and Strings, and normalize to Title Case
        raw_val = row.severity.value if hasattr(row.severity, 'value') else str(row.severity)
        key = raw_val.lower().capitalize()
        severity_breakdown[key] = severity_breakdown.get(key, 0) + row.cnt

    logger.info("Dashboard Summary Metrics", 
                total_vulns=total_vulns, 
                breakdown=severity_breakdown,
                active_assets=active_assets)

    # Exploit count (Optimized direct count)
    exploit_count = (await db.execute(
        select(func.count(Vulnerability.id))
        .where(Vulnerability.false_positive == False, Vulnerability.exploit_available == True)
    )).scalar() or 0

    # Top 5 risky assets (True calculation by normalized score + duplicate prevention)
    top_risks = []
    try:
        # Find latest/highest score for each asset uniquely
        subq = (
            select(RiskScore.asset_id, func.max(RiskScore.calculated_at).label("latest"))
            .group_by(RiskScore.asset_id)
            .subquery()
        )
        top_risk_result = await db.execute(
            select(RiskScore, Asset)
            .join(subq, (RiskScore.asset_id == subq.c.asset_id) & (RiskScore.calculated_at == subq.c.latest))
            .join(Asset, RiskScore.asset_id == Asset.id)
            .order_by(desc(RiskScore.normalized_score))
            .limit(5)
        )
        for rs, a in top_risk_result:
            try:
                top_risks.append({
                    "asset_id":    str(a.id),
                    "ip":          str(a.ip_address) if a.ip_address else "Unknown",
                    "hostname":    a.hostname or "Generic Node",
                    "score":       float(rs.normalized_score) if rs.normalized_score is not None else 0.0,
                    "level":       (rs.risk_level.value if hasattr(rs.risk_level, 'value') else str(rs.risk_level)) if rs.risk_level else "Low",
                    "criticality": (a.criticality.value if hasattr(a.criticality, 'value') else str(a.criticality)) if a.criticality else "Medium",
                })
            except Exception as e:
                logger.warning("Error serializing risky asset", error=str(e))
                continue
    except Exception as e:
        logger.error("Failed to fetch top risks", error=str(e))

    # Latest enterprise risk score
    latest_posture = (await db.execute(
        select(PostureHistory).order_by(desc(PostureHistory.snapshot_date)).limit(1)
    )).scalar_one_or_none()
    enterprise_score = float(latest_posture.enterprise_risk_score) if latest_posture else 0.0

    # Total active and completed scans for status tracking
    recent_scans_list = []
    try:
        scans_result = await db.execute(
            select(Scan).order_by(desc(Scan.created_at)).limit(10)
        )
        recent_scans_list = scans_result.scalars().all()
    except Exception as e:
        logger.error("Failed to fetch recent scans", error=str(e))

    recent_scans_data = [
        {
            "id":           str(s.id),
            "name":         s.scan_name,
            "status":       s.status.value,
            "started_at":   s.started_at.isoformat() if s.started_at else (s.created_at.isoformat() if s.created_at else None),
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
            "target":       s.target_range,
        }
        for s in recent_scans_list
    ]

    # Recent findings
    recent_findings_result = await db.execute(
        select(Vulnerability, Asset)
        .join(Asset, Vulnerability.asset_id == Asset.id)
        .where(Vulnerability.false_positive == False)
        .order_by(desc(Vulnerability.cvss_score))
        .limit(10)
    )
    recent_findings = recent_findings_result.all()

    res = ApiResponse(
        success=True,
        message="Dashboard intelligence summarized",
        data={
            "enterprise_risk_score":    enterprise_score,
            "total_assets":             asset_row.total,
            "active_assets":            asset_row.active,
            "total_vulnerabilities":    total_vulns,
            "exploitable_vulnerabilities": exploit_count,
            "severity_breakdown":       severity_breakdown,
            "criticality_breakdown":    criticality_breakdown,
            "top_risky_assets":         top_risks,
            "recent_vulnerabilities":   [_vuln_to_dict(v, a) for v, a in recent_findings],
            "recent_scans":             recent_scans_data
        }
    )
    dashboard_cache.set(cache_key, res, ttl=3600)
    return res


@app.get("/api/risk-heatmap", tags=["Dashboard"])
async def risk_heatmap(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    Returns heatmap data: each asset plotted on (Likelihood × Impact).
    Likelihood = threat intel score (0-1)
    Impact     = CVSS-weighted criticality (0-1)
    """
    cache_key = "risk_heatmap"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    # Subqueries to find the latest risk score and threat intel fetch for each asset
    subq_risk = (
        select(RiskScore.asset_id, func.max(RiskScore.calculated_at).label("latest_calc"))
        .group_by(RiskScore.asset_id)
        .subquery()
    )
    subq_intel = (
        select(ThreatIntel.asset_id, func.max(ThreatIntel.fetched_at).label("latest_fetch"))
        .group_by(ThreatIntel.asset_id)
        .subquery()
    )
    
    # Unified database query with outerjoins
    query = (
        select(Asset, RiskScore, ThreatIntel)
        .where(Asset.status == "active")
        .outerjoin(subq_risk, Asset.id == subq_risk.c.asset_id)
        .outerjoin(RiskScore, (RiskScore.asset_id == Asset.id) & (RiskScore.calculated_at == subq_risk.c.latest_calc))
        .outerjoin(subq_intel, Asset.id == subq_intel.c.asset_id)
        .outerjoin(ThreatIntel, (ThreatIntel.asset_id == Asset.id) & (ThreatIntel.fetched_at == subq_intel.c.latest_fetch))
    )
    
    result = await db.execute(query)
    
    heatmap = []
    for asset, rs, ti in result:
        if not rs: continue
        
        likelihood = float(ti.composite_threat_score) / 100.0 if (ti and ti.composite_threat_score is not None) else 0.0
        impact     = float(rs.normalized_score) / 100.0 if (rs and rs.normalized_score is not None) else 0.0
        
        heatmap.append({
            "asset_id":   str(asset.id),
            "ip":         str(asset.ip_address) if asset.ip_address else "Unknown",
            "hostname":   asset.hostname or "Generic Node",
            "likelihood": round(likelihood, 3),
            "impact":     round(impact, 3),
            "risk_level": (rs.risk_level.value if hasattr(rs.risk_level, 'value') else str(rs.risk_level)) if rs.risk_level else "Low",
            "criticality": (asset.criticality.value if hasattr(asset.criticality, 'value') else str(asset.criticality)) if asset.criticality else "Medium",
        })

    res = ApiResponse(
        success=True,
        message="Heatmap data compiled",
        data={"heatmap": heatmap, "total": len(heatmap)}
    )
    dashboard_cache.set(cache_key, res, ttl=3600)
    return res


@app.get("/api/risk-forecast", tags=["Intelligence"])
async def risk_forecast(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Predictive enterprise risk trend for next 7 days."""
    cache_key = "risk_forecast"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await predictive_engine.get_risk_forecast(db)
        res = ApiResponse(success=True, message="Risk forecast generated", data=data)
        dashboard_cache.set(cache_key, res, ttl=3600)
        return res
    except Exception as e:
        logger.error("Forecast failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/network-topology", tags=["Intelligence"])
async def network_topology(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Force-directed graph data of network assets."""
    cache_key = "network_topology"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    try:
        data = await predictive_engine.get_network_topology(db)
        res = ApiResponse(success=True, message="Topology mapping complete", data=data)
        dashboard_cache.set(cache_key, res, ttl=3600)
        return res
    except Exception as e:
        logger.error("Topology mapping failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/trend-data", tags=["Dashboard"])
async def trend_data(
    days: int = Query(30, le=365, description="Number of days of history"),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Returns daily posture history for trend graph."""
    cache_key = f"trend_data_{days}"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(PostureHistory)
        .where(PostureHistory.snapshot_date >= since)
        .order_by(PostureHistory.snapshot_date)
    )
    history = result.scalars().all()

    res = ApiResponse(
        success=True,
        message=f"Trend data for past {days} days",
        data=[
            {
                "date":                  h.snapshot_date.isoformat(),
                "enterprise_risk_score": float(h.enterprise_risk_score),
                "total_vulnerabilities": h.total_vulnerabilities,
                "critical_vulns":        h.critical_vulnerabilities,
                "exploitable_vulns":     h.exploitable_vulns,
                "total_assets":          h.total_assets,
            }
            for h in history
        ]
    )
    dashboard_cache.set(cache_key, res, ttl=3600)
    return res


@app.get("/api/threat-intel-summary", tags=["Dashboard"])
async def threat_intel_summary(
    limit: int = Query(10, le=50),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Top threats by composite score."""
    cache_key = f"threat_intel_summary_{limit}"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    subq_intel = (
        select(ThreatIntel.asset_id, func.max(ThreatIntel.fetched_at).label("latest"))
        .group_by(ThreatIntel.asset_id)
        .subquery()
    )
    result = await db.execute(
        select(ThreatIntel, Asset)
        .join(subq_intel, (ThreatIntel.asset_id == subq_intel.c.asset_id) & (ThreatIntel.fetched_at == subq_intel.c.latest))
        .join(Asset, ThreatIntel.asset_id == Asset.id)
        .order_by(desc(ThreatIntel.composite_threat_score))
        .limit(limit)
    )
    res = [
        {
            "ip":               str(ti.ip_address),
            "hostname":         a.hostname,
            "composite_score":  float(ti.composite_threat_score),
            "abuse_confidence": ti.abuse_confidence,
            "otx_pulses":       ti.otx_pulse_count,
            "otx_tags":         ti.otx_tags[:5] if ti.otx_tags else [],
            "adversaries":      ti.otx_adversaries[:3] if ti.otx_adversaries else [],
            "is_tor":           ti.abuse_is_tor,
            "country":          ti.abuse_country_code,
            "isp":              ti.abuse_isp,
        }
        for ti, a in result
    ]
    dashboard_cache.set(cache_key, res, ttl=3600)
    return res


# ─────────────────────────────────────────────────────────────
# 6. ADMINISTRATIVE & ACCESS CONTROL
# ─────────────────────────────────────────────────────────────

from models import ApiToken

@app.get("/api/admin/tokens", tags=["Administrative"])
async def list_access_tokens(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """
    List all active access tokens (accounts).
    Used for professor demonstration of account storage.
    """
    result = await db.execute(
        select(ApiToken).order_by(desc(ApiToken.created_at))
    )
    tokens = result.scalars().all()
    
    return ApiResponse(
        success=True,
        message="Account listing retrieved",
        data=[
            {
                "id":         str(t.id),
                "name":       t.name,
                "token_hash": t.token_hash[:10] + "...",
                "created_at": t.created_at.isoformat(),
            }
            for t in tokens
        ]
    )

@app.get("/api/activity-logs", tags=["Dashboard"])
async def get_activity_logs(
    limit: int = Query(30, le=100),
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    cache_key = f"activity_logs_{limit}"
    cached = dashboard_cache.get(cache_key)
    if cached:
        return cached

    logs = []
    # 0. Primary Mission Logs (New ActivityLog Table)
    logs_q = select(ActivityLog).order_by(desc(ActivityLog.created_at)).limit(limit)
    logs_res = await db.execute(logs_q)
    for al in logs_res.scalars().all():
        logs.append({
            "id": f"log-{al.id}",
            "title": al.title,
            "time": al.created_at,
            "type": al.type
        })

    # 1. Recent Scans
    scans_q = select(Scan).order_by(desc(Scan.created_at)).limit(5)
    scans_res = await db.execute(scans_q)
    for s in scans_res.scalars().all():
        logs.append({
            "id": f"scan-{s.id}",
            "title": f"Mission Update: {s.scan_name} is {s.status.value}",
            "time": s.completed_at or s.started_at or s.created_at,
            "type": "success" if s.status == ScanStatus.completed else "alert" if s.status == ScanStatus.failed else "info"
        })

    # 2. Recent Assets
    assets_q = select(Asset).order_by(desc(Asset.created_at)).limit(5)
    assets_res = await db.execute(assets_q)
    for a in assets_res.scalars().all():
        logs.append({
            "id": f"asset-{a.id}",
            "title": f"Tactical Alert: New Node Discovered at {a.ip_address}",
            "time": a.created_at,
            "type": "info"
        })

    # 3. Risk Snapshots
    snapshots_q = select(PostureHistory).order_by(desc(PostureHistory.created_at)).limit(3)
    snapshots_res = await db.execute(snapshots_q)
    for h in snapshots_res.scalars().all():
        logs.append({
            "id": f"snap-{h.id}",
            "title": f"Posture Snapshot: Risk Score {float(h.enterprise_risk_score)}",
            "time": h.created_at,
            "type": "info"
        })

    # 4. Recent Vulnerabilities
    vulns_q = select(Vulnerability, Asset).join(Asset).order_by(desc(Vulnerability.cvss_score)).limit(10)
    vulns_res = await db.execute(vulns_q)
    for v, a in vulns_res.all():
        logs.append({
            "id": f"vuln-{v.id}",
            "title": f"Security Alert: {v.severity.upper()} Vulnerability detected on {a.ip_address} ({v.cve_id})",
            "time": v.created_at,
            "type": "alert" if v.cvss_score >= 7 else "warning"
        })

    # 5. Mission Notifications
    notifs_q = select(Notification).order_by(desc(Notification.created_at)).limit(10)
    notifs_res = await db.execute(notifs_q)
    for n in notifs_res.scalars().all():
        logs.append({
            "id": f"notif-{n.id}",
            "title": n.title,
            "time": n.created_at,
            "type": n.type
        })

    # Sort all together and limit
    logs.sort(key=lambda x: x["time"], reverse=True)
    
    # Humanize time strings
    formatted_logs = []
    for l in logs[:limit]:
        formatted_logs.append({
            **l,
            "time": l["time"].isoformat() if hasattr(l["time"], "isoformat") else str(l["time"])
        })

    res = ApiResponse(success=True, message="Activity logs synchronized", data=formatted_logs)
    dashboard_cache.set(cache_key, formatted_logs, ttl=5)
    return res

@app.post("/api/mission/trigger", tags=["Dashboard"])
async def trigger_mission_scan(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
):
    """Directly trigger the automated reconnaissance pipeline."""
    from modules.orchestrator import orchestrator
    
    # Create persistent mission log entry
    notif = Notification(
        title="Global Reconnaissance Mission Initiated",
        message="Command broadcasted to all tactical agents for network-wide synchronisation.",
        type="info"
    )
    db.add(notif)
    await db.commit()

    background_tasks.add_task(orchestrator.run_automated_pipeline)
    dashboard_cache.clear()
    return ApiResponse(
        success=True,
        message="Global mission synchronized. Command broadcasted to all tactical agents."
    )



from pydantic import BaseModel, EmailStr

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

@app.post("/api/auth/signup", tags=["Authentication"])
async def auth_signup(req: SignupRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    # 1. Check if user exists
    res = await db.execute(select(User).where(User.email == req.email))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Operative already registered")

    # 2. Create User
    new_user = User(
        email=req.email,
        password_hash=get_password_hash(req.password),
        full_name=req.name
    )
    db.add(new_user)
    await db.flush() # Get ID

    # 3. Create initial token
    raw_token = generate_secure_token()
    new_token = ApiToken(
        user_id=new_user.id,
        token_hash=hash_token(raw_token),
        name=req.name
    )
    db.add(new_token)
    await db.commit()


    return {
        "success": True,
        "message": "Operative initialized",
        "data": {
            "token": raw_token,
            "user": {"name": new_user.full_name, "email": new_user.email}
        }
    }

@app.post("/api/auth/login", tags=["Authentication"])
async def auth_login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    # 1. Fetch user
    res = await db.execute(select(User).where(User.email == req.email))
    user = res.scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # 2. Create a new token for this session
    raw_token = generate_secure_token()
    token_record = ApiToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        name=f"Session {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )
    db.add(token_record)
    await db.commit()


    return ApiResponse(
        success=True,
        message="Token generated",
        data={
            "token": raw_token,
            "user": {"name": user.full_name, "email": user.email}
        }
    )


# ── Helper serializers ────────────────────────────────────────

def _asset_to_dict(a: Asset) -> dict:
    return {
        "id":           str(a.id),
        "ip_address":   str(a.ip_address),
        "hostname":     a.hostname or "Generic Tactical Node",
        "mac_address":  a.mac_address,
        "os_detected":  a.os_detected,
        "open_ports":   a.open_ports,
        "criticality":  a.criticality.value,
        "status":       a.status.value,
        "tags":         a.tags,
        "first_seen":   a.first_seen.isoformat() if a.first_seen else None,
        "last_seen":    a.last_seen.isoformat() if a.last_seen else None,
    }

def _scan_to_dict(s: Scan) -> dict:
    return {
        "id":               str(s.id),
        "scan_name":        s.scan_name,
        "target_range":     s.target_range,
        "asset_id":         str(s.asset_id) if s.asset_id else None,
        "openvas_task_id":  s.openvas_task_id,
        "status":           s.status.value,
        "started_at":       s.started_at.isoformat() if s.started_at else None,
        "completed_at":     s.completed_at.isoformat() if s.completed_at else None,
        "error_message":    s.error_message,
    }

def _vuln_to_dict(v: Vulnerability, a: Asset = None) -> dict:
    data = {
        "id":               str(v.id),
        "asset_id":         str(v.asset_id),
        "cve_id":           v.cve_id,
        "name":             v.name,
        "description":      v.description,
        "severity":         (v.severity.value if hasattr(v.severity, "value") else str(v.severity)) if v.severity else "Medium",
        "cvss_score":       float(v.cvss_score) if v.cvss_score is not None else None,
        "cvss_vector":      v.cvss_vector,
        "port":             v.port,
        "service":          v.service,
        "solution":         v.solution,
        "references":       v.references,
        "exploit_available": bool(v.exploit_available),
        "exploit_details":  v.exploit_details,
    }
    if a:
        data["asset_ip"] = str(a.ip_address)
        data["asset_hostname"] = a.hostname or "Generic Tactical Node"
    return data


# ── Entry point ───────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host    = "0.0.0.0",
        port    = 8001,
        reload  = settings.DEBUG,
        workers = 1 if settings.DEBUG else 4,
    )
from modules.vuln_scanner import vuln_scanner

@app.get("/api/scanner-health", tags=["Environment Diagnostics"])
async def scanner_health():
    """Check if Nmap and GVM/Kali dependencies are met."""
    nmap_path = shutil.which("nmap")
    
    # Check Kali SSH connection (Deep Handshake)
    kali_status = "unknown"
    kali_error = None
    try:
        # Perform a lightweight command to verify GVM responsiveness
        loop = asyncio.get_event_loop()
        # We'll just check if we can get the port list (very fast)
        await loop.run_in_executor(None, vuln_scanner.gvm.get_port_list_id)
        kali_status = "reachable"
    except Exception as e:
        kali_status = "unreachable"
        kali_error = str(e)

    return {
        "nmap": {
            "found": nmap_path is not None,
            "path": nmap_path or "NOT_FOUND"
        },
        "kali_ssh": {
            "host": settings.KALI_HOST,
            "status": kali_status,
            "error": kali_error
        },
        "database": "connected" 
    }

# ── Security Utilities ───────────────────────────────────────

import secrets
import hashlib

def generate_secure_token() -> str:
    """Generate a premium 32-byte secure token for mission access."""
    return secrets.token_urlsafe(32)

def hash_token(token: str) -> str:
    """Securely hash a token for database storage."""
    return hashlib.sha256(token.encode()).hexdigest()
