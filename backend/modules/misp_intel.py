# backend/modules/misp_intel.py
import httpx
import asyncio
import structlog
from datetime import datetime, timezone
from typing import List, Dict, Any, Set

logger = structlog.get_logger()

# We use a mix of reliable open-source feeds
MISP_FEEDS = [
    "https://misp-project.org/feeds/1.json",
    "https://misp-project.org/feeds/5.json",
]

class MISPFeedService:
    """
    Fetches and caches open-source MISP feeds to identify 
    known malicious indicators (IPs, domains).
    """

    def __init__(self):
        self.malicious_ips: Set[str] = set()
        self.last_sync: datetime | None = None
        self._sync_task: asyncio.Task | None = None

    async def sync_feeds(self):
        """Fetch all configured MISP feeds and extract malicious IPs."""
        logger.info("Starting MISP feed synchronization...")
        new_ips = set()
        
        async with httpx.AsyncClient(timeout=30) as client:
            for feed_url in MISP_FEEDS:
                try:
                    resp = await client.get(feed_url)
                    if resp.status_code == 200:
                        data = resp.json()
                        # MISP Feed structure usually has "Event" -> "Attribute"
                        event = data.get("Event", {})
                        attributes = event.get("Attribute", [])
                        for attr in attributes:
                            if attr.get("type") in ["ip-src", "ip-dst", "ip-src|port", "ip-dst|port"]:
                                # Handle port combined types
                                value = attr.get("value", "")
                                ip = value.split("|")[0] if "|" in value else value
                                new_ips.add(ip)
                        logger.debug("Fetched MISP feed", url=feed_url, attributes=len(attributes))
                except Exception as e:
                    logger.warning("Failed to fetch MISP feed", url=feed_url, error=str(e))

        self.malicious_ips = new_ips
        self.last_sync = datetime.now(timezone.utc)
        logger.info("MISP synchronization complete", unique_ips=len(self.malicious_ips))

    async def check_ip(self, ip: str) -> Dict[str, Any]:
        """Check if an IP exists in the cached MISP feeds."""
        if not self.last_sync:
            # First time sync if not already done
            await self.sync_feeds()

        is_malicious = ip in self.malicious_ips
        return {
            "misp_match": is_malicious,
            "misp_feed_count": len(MISP_FEEDS),
            "misp_score": 50.0 if is_malicious else 0.0, # Contribution to threat score
            "misp_last_sync": self.last_sync.isoformat() if self.last_sync else None
        }

misp_service = MISPFeedService()
