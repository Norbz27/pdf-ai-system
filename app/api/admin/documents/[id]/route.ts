import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { auditLogger } from "@/lib/audit-logger"

// PUT - Update document
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { name, categoryId, status } = body
    const documentId = params.id

    // Validate required fields
    if (!name || !categoryId) {
      return NextResponse.json(
        { error: "Missing required fields: name, categoryId" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if document with same name already exists (excluding current document)
    const existingDocument = await db.collection("documents").findOne({ 
      name, 
      _id: { $ne: new ObjectId(documentId) }
    })
    if (existingDocument) {
      return NextResponse.json(
        { error: "Document with this name already exists" },
        { status: 409 }
      )
    }

    const updateData: any = {
      name,
      categoryId,
      updatedAt: new Date().toISOString()
    }

    // Add status if provided
    if (status) {
      updateData.status = status
    }

    const result = await db.collection("documents").updateOne(
      { _id: new ObjectId(documentId) },
      { $set: updateData }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "Document updated successfully"
    })
  } catch (error) {
    console.error("Error updating document:", error)
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    )
  }
}

// PATCH - Update document status (for reprocessing)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { status } = body
    const documentId = params.id

    if (!status || !['processed', 'processing', 'error'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'processed', 'processing', or 'error'" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    const result = await db.collection("documents").updateOne(
      { _id: new ObjectId(documentId) },
      { 
        $set: { 
          status,
          updatedAt: new Date().toISOString()
        } 
      }
    )

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Document status updated to ${status}`
    })
  } catch (error) {
    console.error("Error updating document status:", error)
    return NextResponse.json(
      { error: "Failed to update document status" },
      { status: 500 }
    )
  }
}

// DELETE - Delete document
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Get document to check if it has a file path that needs to be cleaned up
    const document = await db.collection("documents").findOne({ 
      _id: new ObjectId(documentId) 
    })
    
    if (!document) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    const result = await db.collection("documents").deleteOne({ 
      _id: new ObjectId(documentId) 
    })

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      )
    }

    // Log document deletion
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    await auditLogger.documentDelete('Admin', 'admin@example.com', document.name, ipAddress)

    // TODO: If document has a filePath, you might want to delete the actual file
    // This would require file system operations to remove the PDF file
    // if (document.filePath) {
    //   // Delete the actual file from storage
    // }

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully"
    })
  } catch (error) {
    console.error("Error deleting document:", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}
