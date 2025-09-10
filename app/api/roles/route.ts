import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import jwt from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise
    const db = client.db("DocuMind_AI")

    // Fetch all roles
    const roles = await db.collection('roles').find({}).toArray()

    return NextResponse.json({ roles })

  } catch (error) {
    console.error('Error fetching roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
