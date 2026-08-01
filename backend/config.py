# backend/config.py
from pydantic_settings import BaseSettings
from pathlib import Path

_HERE = Path(__file__).parent
_ROOT = _HERE.parent
_ENV  = _HERE / ".env" if (_HERE / ".env").exists() else _ROOT / ".env"


class Settings(BaseSettings):
    APP_NAME: str = "DRPE-Backend"
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me"
    API_TOKEN: str = "drpe-5af890944fd1e57cff37a67b8e946ee2"
    
    # JWT Settings
    JWT_SECRET_KEY: str = "drpe_super_secret_key_change_in_production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    DATABASE_URL: str = "postgresql+asyncpg://drpe_user:drpe_pass@localhost:5432/drpe_db"
    LOCAL_DATABASE_URL: str = "postgresql+asyncpg://drpe_user:drpe_pass@db:5432/drpe_db"

    SCAN_NETWORK_RANGE: str = "172.16.221.0/24"
    NMAP_FLAGS: str = "-sV -O -T4 --open"
    NMAP_PATH: str = ""

    KALI_HOST: str = "192.168.18.35"
    KALI_PORT: int = 22
    KALI_USER: str = "kali"
    KALI_SSH_KEY_PATH: str = "./keys/kali_id_rsa"
    KALI_PASSWORD: str = "kali"

    GVM_CONNECTION_TYPE: str = "socket"  # "socket" or "tls"
    GVM_SOCKET_PATH: str = "/run/gvmd/gvmd.sock"
    GVM_HOST: str = "127.0.0.1"
    GVM_PORT: int = 9390
    GVM_USERNAME: str = "admin_new"
    GVM_PASSWORD: str = "password123"
    GVM_REPORTS_DIR: str = "/tmp/gvm_reports"

    OTX_API_KEY: str = ""
    ABUSEIPDB_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    

    
    # AI Intelligence Settings
    AI_PROVIDER: str = "ollama"  # 'gemini' or 'ollama'
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "deepseek-r1:1.5b"

    POSTURE_SNAPSHOT_CRON: str = "0 6 * * *"
    AUTOMATED_SCAN_INTERVAL_HOURS: int = 0  # Force live scans for demo

    # Stored as plain string, parsed into list via property below
    # Supports both:  a,b,c  and  ["a","b","c"]
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000,http://localhost"

    @property
    def cors_origins_list(self) -> list[str]:
        v = self.CORS_ORIGINS.strip()
        if v.startswith("["):
            import json
            return json.loads(v)
        return [o.strip() for o in v.split(",") if o.strip()]

    class Config:
        env_file = str(_ENV)
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()