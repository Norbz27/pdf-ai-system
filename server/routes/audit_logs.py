from fastapi import APIRouter, HTTPException, Query, Request
from server.lib.mongodb import get_database
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import csv
import io
import logging

router = APIRouter()

logger = logging.getLogger(__name__)

@router.post("")
async def create_audit_log(request: Request):
    try:
        body = await request.json()
        user = body.get("user")
        user_email = body.get("userEmail")
        action = body.get("action")
        resource = body.get("resource")
        details = body.get("details")
        ip_address = body.get("ipAddress")
        user_agent = body.get("userAgent")
        severity = body.get("severity", "info")
        category = body.get("category")

        if not all([user, user_email, action, resource, category]):
            raise HTTPException(status_code=400, detail="Missing required fields")

        db = await get_database()
        audit_log = {
            "user": user,
            "userEmail": user_email,
            "action": action,
            "resource": resource,
            "details": details,
            "ipAddress": ip_address,
            "userAgent": user_agent,
            "severity": severity,
            "category": category,
            "timestamp": datetime.utcnow().isoformat(),
            "createdAt": datetime.utcnow()
        }

        result = await db["auditlogs"].insert_one(audit_log)

        return {"success": True, "id": str(result.inserted_id)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audit log creation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create audit log")

@router.get("")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    category: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    date_range: Optional[str] = Query(None),
    search: Optional[str] = Query(None)
):
    try:
        db = await get_database()

        # Build filter
        filter_query = {}

        if category and category != "all":
            filter_query["category"] = category

        if severity and severity != "all":
            filter_query["severity"] = severity

        if date_range and date_range != "all":
            now = datetime.utcnow()
            if date_range == "today":
                start_date = datetime(now.year, now.month, now.day)
            elif date_range == "week":
                start_date = now - timedelta(days=7)
            elif date_range == "month":
                start_date = datetime(now.year, now.month, 1)
            else:
                start_date = datetime.min

            filter_query["createdAt"] = {"$gte": start_date}

        if search:
            filter_query["$or"] = [
                {"user": {"$regex": search, "$options": "i"}},
                {"userEmail": {"$regex": search, "$options": "i"}},
                {"action": {"$regex": search, "$options": "i"}},
                {"resource": {"$regex": search, "$options": "i"}},
                {"details": {"$regex": search, "$options": "i"}}
            ]

        # Get total count
        total = await db["auditlogs"].count_documents(filter_query)

        # Get paginated results
        logs = await db["auditlogs"].find(filter_query).sort("createdAt", -1).skip((page - 1) * limit).limit(limit).to_array(length=None)

        total_pages = (total + limit - 1) // limit

        serialized_logs = []
        for log in logs:
            serialized_logs.append({
                "_id": str(log["_id"]),
                "user": log["user"],
                "userEmail": log["userEmail"],
                "action": log["action"],
                "resource": log["resource"],
                "details": log.get("details"),
                "ipAddress": log.get("ipAddress"),
                "userAgent": log.get("userAgent"),
                "severity": log["severity"],
                "category": log["category"],
                "timestamp": log["timestamp"]
            })

        return {
            "logs": serialized_logs,
            "pagination": {
                "total": total,
                "page": page,
                "limit": limit,
                "totalPages": total_pages
            }
        }

    except Exception as e:
        logger.error(f"Audit logs fetch error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")

@router.post("/export")
async def export_audit_logs(request: Request):
    try:
        body = await request.json()
        category = body.get("category")
        severity = body.get("severity")
        date_range = body.get("dateRange")
        search = body.get("search")

        db = await get_database()

        # Build filter (same as get_audit_logs)
        filter_query = {}

        if category and category != "all":
            filter_query["category"] = category

        if severity and severity != "all":
            filter_query["severity"] = severity

        if date_range and date_range != "all":
            now = datetime.utcnow()
            if date_range == "today":
                start_date = datetime(now.year, now.month, now.day)
            elif date_range == "week":
                start_date = now - timedelta(days=7)
            elif date_range == "month":
                start_date = datetime(now.year, now.month, 1)
            else:
                start_date = datetime.min

            filter_query["createdAt"] = {"$gte": start_date}

        if search:
            filter_query["$or"] = [
                {"user": {"$regex": search, "$options": "i"}},
                {"userEmail": {"$regex": search, "$options": "i"}},
                {"action": {"$regex": search, "$options": "i"}},
                {"resource": {"$regex": search, "$options": "i"}},
                {"details": {"$regex": search, "$options": "i"}}
            ]

        # Get all matching logs
        logs = await db["auditlogs"].find(filter_query).sort("createdAt", -1).to_array(length=None)

        # Convert to CSV
        output = io.StringIO()
        writer = csv.writer(output)

        # Headers
        writer.writerow([
            "Timestamp", "User", "Email", "Action", "Resource", "Details",
            "Severity", "Category", "IP Address", "User Agent"
        ])

        # Rows
        for log in logs:
            writer.writerow([
                log["timestamp"],
                log["user"],
                log["userEmail"],
                log["action"],
                log["resource"],
                log.get("details", ""),
                log["severity"],
                log["category"],
                log.get("ipAddress", ""),
                log.get("userAgent", "")
            ])

        csv_content = output.getvalue()
        output.close()

        from fastapi.responses import StreamingResponse
        def iter_csv():
            yield csv_content

        return StreamingResponse(
            iter_csv(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=audit-logs-{datetime.utcnow().date()}.csv"}
        )

    except Exception as e:
        logger.error(f"Audit logs export error: {e}")
        raise HTTPException(status_code=500, detail="Failed to export audit logs")
