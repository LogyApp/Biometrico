from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "mysql+aiomysql://claude_user:defgo244r*@34.162.109.112:3307/Desplegables"
    cosine_threshold: float = 0.65
    offline_sync_tolerance: float = 0.05
    insightface_model: str = "buffalo_l"
    insightface_det_size: int = 640
    face_inference_workers: int = 4
    embedding_cache_ttl_seconds: int = 60
    avatar_bucket: str = "logyser-perfiles"
    avatar_prefix: str = "facial-avatars"
    gcp_project_id: str = "eternal-brand-454501-i8"
    log_level: str = "INFO"
    internal_task_token: str = ""


settings = Settings()
