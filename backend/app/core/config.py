"""
AquaGuard — Centralised settings via pydantic-settings.
All values can be overridden by a .env file at the project root.
"""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────
    APP_NAME: str = "AquaGuard API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # ── Security ─────────────────────────────────────────
    SECRET_KEY: str = "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET_IN_PRODUCTION"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── MongoDB ───────────────────────────────────────────
    MONGODB_URI: str = ""
    MONGODB_DB_NAME: str = "aquaguard"

    # ── MQTT ─────────────────────────────────────────────
    MQTT_HOST: str = "localhost"
    MQTT_PORT: int = 1883
    MQTT_TLS_PORT: int = 8883
    MQTT_USERNAME: str = ""
    MQTT_PASSWORD: str = ""
    MQTT_USE_TLS: bool = False

    # ── Legacy / Existing config ──────────────────────────
    EDGE_NODE_URL: str = "http://localhost:3000"
    BACKEND_PORT: int = 8000
    AQUIO_ENABLED: bool = False
    AQUIO_API_URL: str = "https://api.aquio.smartaquamarket.com/api/v1"
    AQUIO_EMAIL: str = ""
    AQUIO_PASSWORD: str = ""
    AQUIO_TANK_ID: int = 1
    AQUIO_POLL_INTERVAL_SEC: float = 2.0
    MONGODB_URI_LEGACY: str = ""  # mapped from old MONGODB_URI env key

    # ── CORS ─────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["*"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


# Convenience singleton
settings = get_settings()
