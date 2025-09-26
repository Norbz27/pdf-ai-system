import os
from dotenv import load_dotenv

# Load environment variables from the server directory
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

class Settings:
    OLLAMA_URL = os.getenv("OLLAMA_URL")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL")
    MONGODB_URI = os.getenv("MONGODB_URI")
    JWT_SECRET = os.getenv("JWT_SECRET")

settings = Settings()
