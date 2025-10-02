from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
import os
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

@router.get("")
async def download_file(
    file_path: str = Query(..., description="Path to the file to download"),
    file_name: str = Query("document.pdf", description="Name for the downloaded file")
):
    try:
        if not file_path:
            raise HTTPException(status_code=400, detail="Missing filePath")

        # Ensure the path is absolute or resolve relative to cwd
        if not os.path.isabs(file_path):
            abs_path = os.path.join(os.getcwd(), file_path)
        else:
            abs_path = file_path

        # Check if file exists
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="File not found")

        # Return file response
        return FileResponse(
            path=abs_path,
            media_type="application/pdf",
            filename=file_name
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download error: {e}")
        raise HTTPException(status_code=500, detail="Server error")
