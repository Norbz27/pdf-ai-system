import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(request: NextRequest) {
  try {
    const { password, targetDashboard } = await request.json()
    
    if (!password || !targetDashboard) {
      return NextResponse.json(
        { error: 'Password and target dashboard are required' },
        { status: 400 }
      )
    }

    // Get auth token from request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const token = authHeader.substring(7)
    
    // Verify token and get user
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    
    const client = await clientPromise
    const db = client.db()
    
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) })
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password)
    
    if (!isPasswordValid) {
      // Log failed attempt
      await db.collection('auditlogs').insertOne({
        user: user._id,
        userEmail: user.email,
        action: 'DASHBOARD_ACCESS_DENIED',
        resource: targetDashboard,
        details: { reason: 'Invalid password' },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent'),
        severity: 'warning',
        category: 'security',
        timestamp: new Date()
      })
      
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    // Check permissions for target dashboard
    const hasPermission = targetDashboard === 'admin' 
      ? user.permissions?.includes('admin_access')
      : user.permissions?.includes('user_page_access')

    if (!hasPermission) {
      await db.collection('auditlogs').insertOne({
        user: user._id,
        userEmail: user.email,
        action: 'DASHBOARD_ACCESS_DENIED',
        resource: targetDashboard,
        details: { reason: 'Insufficient permissions' },
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent'),
        severity: 'warning',
        category: 'security',
        timestamp: new Date()
      })
      
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      )
    }

    // Generate temporary access token for dashboard switching
    const tempToken = jwt.sign(
      { 
        userId: user._id.toString(), 
        dashboard: targetDashboard,
        type: 'dashboard_switch',
        exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
      },
      process.env.JWT_SECRET!
    )

    // Log successful access
    await db.collection('auditlogs').insertOne({
      user: user._id,
      userEmail: user.email,
      action: 'DASHBOARD_ACCESS_GRANTED',
      resource: targetDashboard,
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent'),
      severity: 'info',
      category: 'security',
      timestamp: new Date()
    })

    return NextResponse.json({
      success: true,
      tempToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    })

  } catch (error) {
    console.error('Password verification error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
