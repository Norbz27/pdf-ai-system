import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { category, severity, dateRange, search } = body

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

    // Get all matching logs (no pagination for export)
    const logs = await db.collection("auditlogs")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray()

    // Convert to CSV
    const csvHeaders = [
      'Timestamp',
      'User',
      'Email',
      'Action',
      'Resource',
      'Details',
      'Severity',
      'Category',
      'IP Address',
      'User Agent'
    ]

    const csvRows = logs.map(log => [
      log.timestamp,
      log.user,
      log.userEmail,
      log.action,
      log.resource,
      log.details || '',
      log.severity,
      log.category,
      log.ipAddress || '',
      log.userAgent || ''
    ])

    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n')

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error("Audit logs export error:", error)
    return NextResponse.json(
      { error: "Failed to export audit logs" },
      { status: 500 }
    )
  }
}
