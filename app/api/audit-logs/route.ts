import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { AuditLog } from "@/lib/models/audit-log"

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
      severity = 'info',
      category
    } = body

    if (!user || !userEmail || !action || !resource || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    const auditLog: Omit<AuditLog, '_id'> = {
      user,
      userEmail,
      action,
      resource,
      details,
      ipAddress,
      userAgent,
      severity,
      category,
      timestamp: new Date().toISOString(),
      createdAt: new Date()
    }

    const result = await db.collection("auditlogs").insertOne(auditLog)

    return NextResponse.json({
      success: true,
      id: result.insertedId
    })
  } catch (error) {
    console.error("Audit log creation error:", error)
    return NextResponse.json(
      { error: "Failed to create audit log" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const category = searchParams.get('category')
    const severity = searchParams.get('severity')
    const dateRange = searchParams.get('dateRange')
    const search = searchParams.get('search')

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Build filter
    const filter: any = {}

    if (category && category !== 'all') {
      filter.category = category
    }

    if (severity && severity !== 'all') {
      filter.severity = severity
    }

    if (dateRange && dateRange !== 'all') {
      const now = new Date()
      let startDate: Date

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        default:
          startDate = new Date(0)
      }

      filter.createdAt = { $gte: startDate }
    }

    if (search) {
      filter.$or = [
        { user: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { resource: { $regex: search, $options: 'i' } },
        { details: { $regex: search, $options: 'i' } }
      ]
    }

    // Get total count
    const total = await db.collection("auditlogs").countDocuments(filter)

    // Get paginated results
    const logs = await db.collection("auditlogs")
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray()

    const totalPages = Math.ceil(total / limit)

    return NextResponse.json({
      logs: logs.map(log => ({
        _id: log._id,
        user: log.user,
        userEmail: log.userEmail,
        action: log.action,
        resource: log.resource,
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        severity: log.severity,
        category: log.category,
        timestamp: log.timestamp
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    })
  } catch (error) {
    console.error("Audit logs fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    )
  }
}
