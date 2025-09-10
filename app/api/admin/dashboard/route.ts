import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Get total documents
    const totalDocuments = await db.collection("documents").countDocuments()

    // Get total documents previous month
    const startOfCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const startOfPreviousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    const endOfPreviousMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 0)

    const totalDocumentsPreviousMonth = await db.collection("documents").countDocuments({
      createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth }
    })

    // Get total users
    const totalUsers = await db.collection("users").countDocuments()

    // Get total users previous month
    const totalUsersPreviousMonth = await db.collection("users").countDocuments({
      createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth }
    })

    // Get total queries from audit logs (assuming queries are logged with category 'query')
    const totalQueries = await db.collection("auditlogs").countDocuments({
      category: 'query'
    })

    // Get total queries previous month
    const totalQueriesPreviousMonth = await db.collection("auditlogs").countDocuments({
      category: 'query',
      createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth }
    })

    // Calculate processing rate (percentage of successful queries)
    const successfulQueries = await db.collection("auditlogs").countDocuments({
      category: 'query',
      severity: 'info' // Assuming successful queries are logged as info
    })
    const successfulQueriesPreviousMonth = await db.collection("auditlogs").countDocuments({
      category: 'query',
      severity: 'info',
      createdAt: { $gte: startOfPreviousMonth, $lt: startOfCurrentMonth }
    })

    const processingRate = totalQueries > 0 ? (successfulQueries / totalQueries * 100).toFixed(1) : "0.0"
    const processingRatePreviousMonth = totalQueriesPreviousMonth > 0 ? (successfulQueriesPreviousMonth / totalQueriesPreviousMonth * 100).toFixed(1) : "0.0"

    // Get recent activity (last 6 entries from audit logs)
    const recentActivity = await db.collection("auditlogs")
      .find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray()

    // Format recent activity for dashboard
    const formattedActivity = recentActivity.map(log => ({
      id: log._id.toString(),
      type: log.category,
      user: log.user,
      action: log.action,
      document: log.resource,
      time: new Date(log.createdAt).toLocaleString(),
      avatar: "/placeholder-user.jpg" // Default avatar
    }))

    // Get upload trends data (documents uploaded in last 30 days, grouped by day)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const uploadTrends = await db.collection("documents")
      .aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { "_id": 1 }
        }
      ])
      .toArray()

    const calculateChange = (current: number, previous: number) => {
      if (previous === 0) {
        return { change: "0.0%", changeType: "neutral" }
      }
      const diff = current - previous
      const percentChange = (diff / previous) * 100
      const changeType = percentChange >= 0 ? "positive" : "negative"
      const change = `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(1)}%`
      return { change, changeType }
    }

    const documentsChange = calculateChange(totalDocuments, totalDocumentsPreviousMonth)
    const usersChange = calculateChange(totalUsers, totalUsersPreviousMonth)
    const queriesChange = calculateChange(totalQueries, totalQueriesPreviousMonth)
    const processingRateChange = calculateChange(parseFloat(processingRate), parseFloat(processingRatePreviousMonth))

    const stats = [
      {
        title: "Total Documents",
        value: totalDocuments.toString(),
        change: documentsChange.change,
        changeType: documentsChange.changeType,
        icon: "FileText",
        color: "text-blue-600"
      },
      {
        title: "Total Users",
        value: totalUsers.toString(),
        change: usersChange.change,
        changeType: usersChange.changeType,
        icon: "Users",
        color: "text-green-600"
      },
      {
        title: "Total Queries",
        value: totalQueries.toString(),
        change: queriesChange.change,
        changeType: queriesChange.changeType,
        icon: "MessageSquare",
        color: "text-purple-600"
      },
      {
        title: "Processing Rate",
        value: `${processingRate}%`,
        change: processingRateChange.change,
        changeType: processingRateChange.changeType,
        icon: "TrendingUp",
        color: "text-orange-600"
      }
    ]

    return NextResponse.json({
      stats,
      recentActivity: formattedActivity,
      uploadTrends
    })
  } catch (error) {
    console.error("Dashboard data fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    )
  }
}
