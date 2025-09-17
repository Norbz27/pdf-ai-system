import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import clientPromise from "@/lib/mongodb"
import { ObjectId } from "mongodb"
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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File
    const categoryId = formData.get("categoryId") as string
    const uploadedBy = formData.get("uploadedBy") as string

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      )
    }

    if (!categoryId || !uploadedBy) {
      return NextResponse.json(
        { error: "Missing required fields: categoryId, uploadedBy" },
        { status: 400 }
      )
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 }
      )
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Check if category exists
    const category = await db.collection("categories").findOne({ 
      _id: new ObjectId(categoryId) 
    })
    if (!category) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      )
    }

    // Check if user exists
    const user = await db.collection("users").findOne({ 
      _id: new ObjectId(uploadedBy) 
    })
    if (!user) {
      return NextResponse.json(
        { error: "Invalid user" },
        { status: 400 }
      )
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), "public", "uploads")
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const originalName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const fileName = originalName
    const filePath = join(uploadsDir, fileName)

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Extract text and page count from PDF
    let pageCount = 0
    let chunks: any[] = []
    try {
      const { text, pages } = await extractTextAndPageCountFromPDF(buffer)
      pageCount = pages
      chunks = chunkText(text, 1000)
    } catch (error) {
      console.error("Error extracting PDF content:", error)
      // If we can't extract content, default to 0 pages and empty chunks
      pageCount = 0
      chunks = []
    }

    // Calculate file size in MB
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(1)

    // Create document record in database
    const newDocument = {
      name: originalName,
      categoryId: new ObjectId(categoryId),
      uploadedBy: new ObjectId(uploadedBy),
      size: `${sizeInMB} MB`,
      pages: pageCount,
      chunks,
      status: "processed",
      filePath: `public/uploads/${fileName}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("documents").insertOne(newDocument)

    return NextResponse.json({
      success: true,
      documentId: result.insertedId,
      document: { ...newDocument, _id: result.insertedId },
      filePath: `public/uploads/${fileName}`
    })
  } catch (error) {
    console.error("Error uploading document:", error)
    return NextResponse.json(
      { error: "Failed to upload document" },
      { status: 500 }
    )
  }
} 