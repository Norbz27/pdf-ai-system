from fastapi import APIRouter
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/test-env")
async def test_environment_variables():
    """
    Test environment variables and return configuration information
    """
    try:
        # Define environment variables to check (without exposing sensitive values)
        env_vars_to_check = [
            "MONGODB_URL",
            "JWT_SECRET_KEY",
            "OLLAMA_BASE_URL",
            "UPLOAD_DIR",
            "FAISS_INDEX_PATH",
            "NEXT_PUBLIC_API_URL",
            "ENVIRONMENT",
            "DEBUG"
        ]

        env_status = {}
        for var in env_vars_to_check:
            value = os.getenv(var)
            if value:
                # For sensitive variables, just indicate presence
                if var in ["MONGODB_URL", "JWT_SECRET_KEY"]:
                    env_status[var] = "set (value hidden)"
                else:
                    env_status[var] = value
            else:
                env_status[var] = "not set"

        # Additional system information
        system_info = {
            "python_version": os.sys.version,
            "platform": os.sys.platform,
            "current_working_directory": os.getcwd(),
            "upload_directory_exists": os.path.exists(os.getenv("UPLOAD_DIR", "uploads")),
            "faiss_index_directory_exists": os.path.exists(os.path.dirname(os.getenv("FAISS_INDEX_PATH", "faiss_index"))),
        }

        logger.info("Environment variables test completed")
        return {
            "status": "success",
            "message": "Environment variables check completed",
            "environment_variables": env_status,
            "system_info": system_info
        }

    except Exception as e:
        logger.error(f"Environment variables test failed: {str(e)}")
        return {
            "status": "error",
            "message": f"Environment variables test failed: {str(e)}",
            "environment_variables": {},
            "system_info": {}
        }
