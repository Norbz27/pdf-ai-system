import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { auditLogger } from "@/lib/audit-logger"

// GET - Fetch all documents
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Build filter object
    const filter: any = {}
    
    if (category && category !== 'all') {
      filter.category = category
    }
    
    if (status && status !== 'all') {
      filter.status = status
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { uploadedBy: { $regex: search, $options: 'i' } }
      ]
    }

    // Aggregate to join with categories and users collections
    const documents = await db.collection("documents").aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "uploadedBy",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      {
        $addFields: {
          category: { $arrayElemAt: ["$categoryInfo.name", 0] },
          uploadedBy: { $arrayElemAt: ["$userInfo.name", 0] }
        }
      },
      {
        $project: {
          categoryInfo: 0,
          userInfo: 0
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray()
    
    return NextResponse.json({ documents })
  } catch (error) {
    console.error("Error fetching documents:", error)
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    )
  }
}

// POST - Create new document (for manual entry or reprocessing)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, categoryId, uploadedBy, size, pages, status = "processing" } = body

    // Validate required fields
    if (!name || !categoryId || !uploadedBy) {
      return NextResponse.json(
        { error: "Missing required fields: name, categoryId, uploadedBy" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if document with same name already exists
    const existingDocument = await db.collection("documents").findOne({ name })
    if (existingDocument) {
      return NextResponse.json(
        { error: "Document with this name already exists" },
        { status: 409 }
      )
    }

    const newDocument = {
      name,
      categoryId,
      uploadedBy,
      size: size || "0 MB",
      pages: pages || 0,
      status,
      filePath: "", // Will be set when file is actually uploaded
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("documents").insertOne(newDocument)

    // Log document upload
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    await auditLogger.documentUpload('Admin', 'admin@example.com', name, size, pages, ipAddress)

    return NextResponse.json({
      success: true,
      documentId: result.insertedId,
      document: { ...newDocument, _id: result.insertedId }
    })
  } catch (error) {
    console.error("Error creating document:", error)
    return NextResponse.json(
      { error: "Failed to create document" },
      { status: 500 }
    )
  }
} 