import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import jwt from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Fetch all users with role info
    const users = await db.collection('users').aggregate([
      {
        $lookup: {
          from: 'roles',
          localField: 'roleId',
          foreignField: '_id',
          as: 'roleInfo'
        }
      },
      {
        $addFields: {
          role: { $arrayElemAt: ["$roleInfo.name", 0] }
        }
      },
      {
        $project: {
          password: 0,
          passwordResetRequired: 0,
          twoFASecret: 0,
          roleInfo: 0
        }
      }
    ]).toArray()

    return NextResponse.json({ users })

  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
