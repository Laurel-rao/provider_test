from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    DATABASE_URL: str = "mysql+aiomysql://root:password@mysql:3306/api_monitor"

    # JWT Authentication
    JWT_SECRET_KEY: str = "your-jwt-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # Fernet Encryption Key
    FERNET_KEY: str = "your-fernet-key-change-in-production"

    # Application
    APP_NAME: str = "API Monitor Dashboard"
    DEBUG: bool = False

    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str | None = None


settings = Settings()
