"""Application Settings - Central Configuration"""
from functools import lru_cache
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )
    
    # MongoDB
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "workflow_ops_dev"
    
    # Azure AD (Entra) Configuration
    aad_tenant_id: str = ""
    aad_client_id: str = ""
    aad_client_secret: str = ""
    aad_audience: str = ""
    
    # Service Mailbox (ROPC)
    service_mailbox_email: str = ""
    service_mailbox_password: str = ""
    
    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4"
    azure_openai_api_version: str = "2024-02-01"
    
    # Attachments
    attachments_max_mb: int = 50
    attachments_base_path: str = "./storage/attachments"
    allowed_mime_types: str = "application/pdf,image/png,image/jpeg,image/gif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
    
    # Logging
    logs_path: str = "./logs"
    log_level: str = "INFO"
    
    # CORS - set to "*" to allow all origins (simpler for internal/VM deployment)
    cors_origins: str = "*"
    
    # Frontend URL (for email links and callbacks)
    frontend_url: str = "http://localhost:3000"
    
    # Scheduler
    scheduler_interval_seconds: int = 10  # Process notifications every 10 seconds
    notification_max_retries: int = 5
    notification_lock_duration_seconds: int = 60  # How long to hold lock on a notification
    stale_lock_cleanup_minutes: int = 10  # Clean up locks older than this
    
    # Environment
    environment: str = "development"
    debug: bool = True
    
    # Bootstrap credentials (for initial super admin setup)
    # Change these in production!
    bootstrap_username: str = "admin"
    bootstrap_password: str = "Admin@123exl"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins string to list"""
        return [origin.strip() for origin in self.cors_origins.split(",")]
    
    @property
    def allowed_mime_types_list(self) -> List[str]:
        """Parse allowed mime types string to list"""
        return [mime.strip() for mime in self.allowed_mime_types.split(",")]
    
    @property
    def attachments_max_bytes(self) -> int:
        """Max attachment size in bytes"""
        return self.attachments_max_mb * 1024 * 1024
    
    @property
    def is_production(self) -> bool:
        """Check if running in production"""
        return self.environment.lower() == "production"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


settings = get_settings()

