import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const severity = searchParams.get('severity')
    const dateRange = searchParams.get('dateRange')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Build filter object
    const filter: any = {}
    
    if (category && category !== 'all') {
      filter.category = category
    }
    
    if (severity && severity !== 'all') {
      filter.severity = severity
    }
    
    if (search) {
      filter.$or = [
        { user: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { resource: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } }
      ]
    }
    
    // Date range filtering
    if (dateRange && dateRange !== 'all') {
      const now = new Date()
      let startDate = new Date()
      
      switch (dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          startDate.setDate(now.getDate() - 7)
          break
        case 'month':
          startDate.setMonth(now.getMonth() - 1)
          break
      }
      
      filter.timestamp = { $gte: startDate.toISOString() }
    }

    // Get total count for pagination
    const totalCount = await db.collection("audit_logs").countDocuments(filter)
    
    // Get logs with pagination
    const logs = await db.collection("audit_logs")
      .find(filter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    return NextResponse.json({
      logs,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit)
      }
    })
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      user,
      userEmail,
      action,
      resource,
      details,
      ipAddress,
      userAgent,
      severity = "info",
      category
    } = body

    // Validate required fields
    if (!user || !action || !resource) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      user,
      userEmail,
      action,
      resource,
      details,
      ipAddress,
      userAgent,
      severity,
      category,
      createdAt: new Date()
    }

    const result = await db.collection("audit_logs").insertOne(logEntry)

    return NextResponse.json({
      success: true,
      logId: result.insertedId
    })
  } catch (error) {
    console.error("Error creating audit log:", error)
    return NextResponse.json(
      { error: "Failed to create audit log" },
      { status: 500 }
    )
  }
} 