"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration. Values come from .env or the process environment."""

    mongodb_uri: str = "mongodb://localhost:27017"
    database_name: str = "medicine_verification"
    jwt_secret: str = "dev_secret_replace_in_production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
