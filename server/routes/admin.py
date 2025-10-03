from fastapi import APIRouter, Depends, HTTPException
from server.middleware.auth import JWTBearer, require_permission
from server.lib.mongodb import get_database
from datetime import datetime, timedelta
from typing import List, Dict, Any
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/health")
async def health_check():
    return {"status": "ok"}

@router.get("/audit-logs")
async def get_audit_logs(user=Depends(require_permission("admin"))):
    # TODO: Query audit logs from DB
    return {"logs": []}

@router.get("/dashboard")
async def get_dashboard_stats(user=Depends(require_permission("admin_access"))):
    """
    Get dashboard statistics for admin
    """
    try:
        db = await get_database()

        # Get total documents
        total_documents = await db.documents.count_documents({})

        # Get total documents previous month
        now = datetime.utcnow()
        start_of_current_month = datetime(now.year, now.month, 1)
        start_of_previous_month = datetime(now.year, now.month - 1, 1) if now.month > 1 else datetime(now.year - 1, 12, 1)
        end_of_previous_month = start_of_current_month - timedelta(days=1)

        total_documents_previous_month = await db.documents.count_documents({
            "createdAt": {"$gte": start_of_previous_month.isoformat(), "$lt": start_of_current_month.isoformat()}
        })

        # Get total users
        total_users = await db.users.count_documents({})

        # Get total users previous month
        total_users_previous_month = await db.users.count_documents({
            "createdAt": {"$gte": start_of_previous_month.isoformat(), "$lt": start_of_current_month.isoformat()}
        })

        # Get total queries from audit logs
        total_queries = await db.auditlogs.count_documents({"category": "query"})

        # Get total queries previous month
        total_queries_previous_month = await db.auditlogs.count_documents({
            "category": "query",
            "createdAt": {"$gte": start_of_previous_month.isoformat(), "$lt": start_of_current_month.isoformat()}
        })

        # Calculate processing rate
        successful_queries = await db.auditlogs.count_documents({
            "category": "query",
            "severity": "info"
        })
        successful_queries_previous_month = await db.auditlogs.count_documents({
            "category": "query",
            "severity": "info",
            "createdAt": {"$gte": start_of_previous_month.isoformat(), "$lt": start_of_current_month.isoformat()}
        })

        processing_rate = f"{(successful_queries / total_queries * 100):.1f}" if total_queries > 0 else "0.0"
        processing_rate_previous_month = f"{(successful_queries_previous_month / total_queries_previous_month * 100):.1f}" if total_queries_previous_month > 0 else "0.0"

        # Get recent activity
        recent_activity_cursor = db.auditlogs.find({}).sort("createdAt", -1).limit(6)
        recent_activity = await recent_activity_cursor.to_list(length=None)

        formatted_activity = []
        for log in recent_activity:
            formatted_activity.append({
                "id": str(log["_id"]),
                "type": log.get("category", ""),
                "user": log.get("user", ""),
                "action": log.get("action", ""),
                "document": log.get("resource", ""),
                "time": log.get("createdAt", ""),
                "avatar": "/placeholder-user.jpg"
            })

        # Get upload trends (last 30 days)
        thirty_days_ago = now - timedelta(days=30)
        upload_trends_pipeline = [
            {"$match": {"createdAt": {"$gte": thirty_days_ago.isoformat()}}},
            {"$addFields": {"createdAtDate": {"$dateFromString": {"dateString": "$createdAt"}}}},
            {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$createdAtDate"}}, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        upload_trends = await db.documents.aggregate(upload_trends_pipeline).to_list(length=None)

        def calculate_change(current: float, previous: float) -> Dict[str, Any]:
            if previous == 0:
                return {"change": "0.0%", "changeType": "neutral"}
            diff = current - previous
            percent_change = (diff / previous) * 100
            change_type = "positive" if percent_change >= 0 else "negative"
            change = f"{'+' if percent_change >= 0 else ''}{percent_change:.1f}%"
            return {"change": change, "changeType": change_type}

        documents_change = calculate_change(float(total_documents), float(total_documents_previous_month))
        users_change = calculate_change(float(total_users), float(total_users_previous_month))
        queries_change = calculate_change(float(total_queries), float(total_queries_previous_month))
        processing_rate_change = calculate_change(float(processing_rate), float(processing_rate_previous_month))

        stats = [
            {
                "title": "Total Documents",
                "value": str(total_documents),
                "change": documents_change["change"],
                "changeType": documents_change["changeType"],
                "icon": "FileText",
                "color": "text-blue-600"
            },
            {
                "title": "Total Users",
                "value": str(total_users),
                "change": users_change["change"],
                "changeType": users_change["changeType"],
                "icon": "Users",
                "color": "text-green-600"
            },
            {
                "title": "Total Queries",
                "value": str(total_queries),
                "change": queries_change["change"],
                "changeType": queries_change["changeType"],
                "icon": "MessageSquare",
                "color": "text-purple-600"
            },
            {
                "title": "Processing Rate",
                "value": f"{processing_rate}%",
                "change": processing_rate_change["change"],
                "changeType": processing_rate_change["changeType"],
                "icon": "TrendingUp",
                "color": "text-orange-600"
            }
        ]

        return {
            "stats": stats,
            "recentActivity": formatted_activity,
            "uploadTrends": upload_trends
        }

    except Exception as e:
        logger.error(f"Error fetching dashboard data: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard data")
