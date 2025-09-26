from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
	MONGODB_URI: str = "mongodb://localhost:27017"
	DB_NAME: str = "DocuMind_AI"

	JWT_SECRET: str = "change_me"
	JWT_ALG: str = "HS256"
	ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

	OLLAMA_URL: str = "http://localhost:11434"
	OLLAMA_MODEL: str = "llama3.2:3b"
	EMBED_MODEL: str = "nomic-embed-text"

	FAISS_DATA_DIR: str = "./faiss"
	REDIS_URL: str | None = None

	FRONTEND_ORIGIN: str = "http://localhost:3000"

	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings() 