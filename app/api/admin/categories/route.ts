import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// GET - Fetch all categories
export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Aggregate to get document count for each category
    const categories = await db.collection("categories").aggregate([
      {
        $lookup: {
          from: "documents",
          localField: "_id",
          foreignField: "categoryId",
          as: "documents"
        }
      },
      {
        $addFields: {
          documentCount: { $size: "$documents" }
        }
      },
      {
        $project: {
          documents: 0
        }
      },
      { $sort: { createdAt: -1 } }
    ]).toArray()
    
    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    )
  }
}

// POST - Create new category
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, description } = body

    // Validate required fields
    if (!name || !description) {
      return NextResponse.json(
        { error: "Missing required fields: name, description" },
        { status: 400 }
      )
    }

    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Check if category with same name already exists
    const existingCategory = await db.collection("categories").findOne({ name })
    if (existingCategory) {
      return NextResponse.json(
        { error: "Category with this name already exists" },
        { status: 409 }
      )
    }

    const newCategory = {
      name,
      description,
      documentCount: 0,
      color: getRandomColor(), // Generate a random color for the category
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await db.collection("categories").insertOne(newCategory)

    return NextResponse.json({
      success: true,
      categoryId: result.insertedId,
      category: { ...newCategory, _id: result.insertedId }
    })
  } catch (error) {
    console.error("Error creating category:", error)
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    )
  }
}

// Helper function to generate random colors for categories
function getRandomColor(): string {
  const colors = [
    "bg-blue-100 text-blue-800",
    "bg-green-100 text-green-800",
    "bg-purple-100 text-purple-800",
    "bg-orange-100 text-orange-800",
    "bg-red-100 text-red-800",
    "bg-yellow-100 text-yellow-800",
    "bg-indigo-100 text-indigo-800",
    "bg-pink-100 text-pink-800",
    "bg-teal-100 text-teal-800",
    "bg-cyan-100 text-cyan-800"
  ]
  return colors[Math.floor(Math.random() * colors.length)]
} 