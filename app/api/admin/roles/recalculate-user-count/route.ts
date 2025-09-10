import { NextRequest, NextResponse } from "next/server"
import clientPromise from "@/lib/mongodb"

// POST - Recalculate user count for all roles
export async function POST(req: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Get all roles
    const roles = await db.collection("roles").find({}).toArray()

    // Recalculate user count for each role
    const updatePromises = roles.map(async (role) => {
      const userCount = await db.collection("users").countDocuments({
        roleId: role._id
      })

      return db.collection("roles").updateOne(
        { _id: role._id },
        {
          $set: {
            userCount,
            updatedAt: new Date().toISOString()
          }
        }
      )
    })

    // Wait for all updates to complete
    await Promise.all(updatePromises)

    // Get updated roles to return
    const updatedRoles = await db.collection("roles").find({}).toArray()

    return NextResponse.json({
      success: true,
      message: "User counts recalculated successfully",
      roles: updatedRoles
    })
  } catch (error) {
    console.error("Error recalculating user counts:", error)
    return NextResponse.json(
      { error: "Failed to recalculate user counts" },
      { status: 500 }
    )
  }
}
