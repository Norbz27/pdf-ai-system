from fastapi import APIRouter, Query, HTTPException, status
from fastapi.responses import FileResponse
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Define the absolute path to the 'uploads' directory at the module level
# This ensures it's calculated correctly relative to the project root
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_DIR = os.path.join(PROJECT_ROOT, "uploads")

@router.get("")
async def download_file(
    filePath: str = Query(..., description="The URL path of the file to download, e.g., /uploads/document.pdf"),
    fileName: str = Query(..., description="The desired name for the downloaded file")
):
    """
    Safely downloads a file from the server's upload directory.
    """
    try:
        # Sanitize the filePath to get just the filename
        # This prevents path traversal attacks (e.g., ../../.../somefile)
        base_name = os.path.basename(filePath)
        
        # Construct the full, absolute path to the file on the server
        full_path = os.path.join(UPLOAD_DIR, base_name)

        if not os.path.exists(full_path) or not os.path.isfile(full_path):
            logger.warning(f"Download attempt for non-existent file: {full_path}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        logger.info(f"Serving file for download: {full_path}")
        return FileResponse(path=full_path, filename=fileName, media_type='application/octet-stream')

    except Exception as e:
        logger.error(f"Error during file download for '{fileName}': {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not process file download.")