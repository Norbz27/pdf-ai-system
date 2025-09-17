import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
import { readFile } from "fs/promises"
import { join } from "path"
import pdf from "pdf-parse"

function chunkText(text: string, chunkSize: number = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({ text: text.slice(i, i + chunkSize), chunkIndex: Math.floor(i / chunkSize) });
  }
  return chunks;
}

async function extractTextAndPageCountFromPDF(buffer: Buffer): Promise<{ text: string, pages: number }> {
  const data = await pdf(buffer);
  return { text: data.text, pages: data.numpages };
}

// PATCH - Update document status (for reprocessing)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await req.json()
    const { status, reprocess } = body
    const { id: documentId } = await params

    if (!status || !['processed', 'processing', 'error'].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be 'processed', 'processing', or 'error'" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // If reprocess is true, perform reprocessing
    if (reprocess) {
      // Get the document to access filePath
      const document = await db.collection("documents").findOne({
        _id: new ObjectId(documentId)
      })

      if (!document) {
        return NextResponse.json(
          { error: "Document not found" },
          { status: 404 }
        )
      }

      if (!document.filePath) {
        return NextResponse.json(
          { error: "Document file path not found" },
          { status: 400 }
        )
      }

      // Read the PDF file
      const filePath = join(process.cwd(), document.filePath)
      let buffer: Buffer
      try {
        buffer = await readFile(filePath)
      } catch (error) {
        console.error("Error reading PDF file:", error)
        return NextResponse.json(
          { error: "Failed to read PDF file" },
          { status: 500 }
        )
      }

      // Extract text and page count from PDF
      let pageCount = 0
      let chunks: any[] = []
      try {
        const { text, pages } = await extractTextAndPageCountFromPDF(buffer)
        pageCount = pages
        chunks = chunkText(text, 1000)
      } catch (error) {
        console.error("Error extracting PDF content:", error)
        // If we can't extract content, set status to error
        await db.collection("documents").updateOne(
          { _id: new ObjectId(documentId) },
          {
            $set: {
              status: 'error',
              updatedAt: new Date().toISOString()
            }
          }
        )
        return NextResponse.json(
          { error: "Failed to extract PDF content" },
          { status: 500 }
        )
      }

      // Update document with reprocessed data
      const result = await db.collection("documents").updateOne(
        { _id: new ObjectId(documentId) },
        {
          $set: {
            status: 'processed',
            pages: pageCount,
            chunks,
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
        message: "Document reprocessed successfully"
      })
    } else {
      // Regular status update
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
    }
  } catch (error) {
    console.error("Error updating document status:", error)
    return NextResponse.json(
      { error: "Failed to update document status" },
      { status: 500 }
    )
  }
}
