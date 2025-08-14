import { NextRequest, NextResponse } from 'next/server'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No token provided' }, { status: 401 })
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    
    // For now, we'll use a simple token validation
    // In production, you should use JWT tokens with proper verification
    if (!token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Connect to database
    const client = await clientPromise
    const db = client.db("DocuMind_AI")
    
    // Find user by token (in a real app, you'd decode the JWT token)
    // For now, we'll assume the token is the user ID
    let user = null
    
    // Try multiple ways to find the user
    try {
      // Method 1: Try ObjectId
      const objectId = new ObjectId(token)
      user = await db.collection('users').findOne({ _id: objectId })
    } catch (error) {
      // Method 2: Try email if ObjectId failed
      user = await db.collection('users').findOne({ email: token })
    }
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 })
    }

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'User account is not active' }, { status: 401 })
    }

    // Get user's role and permissions
    const role = await db.collection('roles').findOne({ _id: user.roleId })
    
    // Return user data without sensitive information
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: role?.name || 'User',
      permissions: role?.permissions || [],
      status: user.status,
      avatar: user.avatar
    }

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error('Auth verification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 