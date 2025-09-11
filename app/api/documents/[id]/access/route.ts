import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from 'jsonwebtoken';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Await dynamic params per Next.js guidance
    const { id } = await context.params;
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid document id' }, { status: 400 });
    }
    const docId = new ObjectId(id);

    // Authenticate requester via JWT
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!);
    } catch (err) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    // Load requester and role/permissions
    const requester = await db.collection('users').findOne({ _id: new ObjectId(decoded.userId) });
    if (!requester || requester.status !== 'active') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const role = requester.roleId ? await db.collection('roles').findOne({ _id: requester.roleId }) : null;
    const permissions: string[] = role?.permissions || [];

    // Parse and validate body
    const body = await request.json();
    const { type, values } = body || {};
    if (!type || (type !== 'name' && type !== 'role')) {
      return NextResponse.json({ error: 'Invalid type. Must be "name" or "role"' }, { status: 400 });
    }
    if (!Array.isArray(values) || values.length === 0) {
      return NextResponse.json({ error: 'Type and non-empty values array are required' }, { status: 400 });
    }
    if (values.length > 100) {
      return NextResponse.json({ error: 'Too many values. Maximum allowed is 100' }, { status: 400 });
    }

    // Load target document
    const document = await db.collection("documents").findOne({ _id: docId });
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Authorization: only owner or admin can grant access
    const isOwner = document.uploadedBy?.toString?.() === requester._id.toString();
    const isAdmin = permissions.includes('admin_access');
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let userIdsToAdd: ObjectId[] = [];
    let grantEntriesToAdd: { type: 'user' | 'role'; value: string; grantedAt: Date }[] = [];
    const now = new Date();

    if (type === 'name') {
      for (const name of values) {
        if (typeof name !== 'string' || !name.trim()) continue;
        const targetUser = await db.collection('users').findOne({ name });
        if (targetUser) {
          userIdsToAdd.push(targetUser._id);
          // Avoid duplicate grants by checking existing entries
          if (!Array.isArray(document.accessGrants) || !document.accessGrants.some((g: any) => g?.type === 'user' && g?.value === name)) {
            grantEntriesToAdd.push({ type: 'user', value: name, grantedAt: now });
          }
        }
      }
      if (userIdsToAdd.length === 0) {
        return NextResponse.json({ error: 'No matching users found for provided names' }, { status: 400 });
      }
    } else if (type === 'role') {
      for (const roleName of values) {
        if (typeof roleName !== 'string' || !roleName.trim()) continue;
        const targetRole = await db.collection('roles').findOne({ name: roleName });
        if (!targetRole) {
          return NextResponse.json({ error: `Role not found: ${roleName}` }, { status: 400 });
        }
        // Users with this role (users schema links by roleId)
        const usersInRole = await db.collection('users')
          .find({ roleId: targetRole._id })
          .project({ _id: 1 })
          .toArray();
        userIdsToAdd.push(...usersInRole.map(u => u._id));
        // Store role grant by name to align with documents GET filtering
        if (!Array.isArray(document.accessGrants) || !document.accessGrants.some((g: any) => g?.type === 'role' && g?.value === roleName)) {
          grantEntriesToAdd.push({ type: 'role', value: roleName, grantedAt: now });
        }
      }
      if (userIdsToAdd.length === 0) {
        return NextResponse.json({ error: 'No users found for provided roles' }, { status: 400 });
      }
    }

    // Deduplicate user IDs by string key
    const uniqueUserIds = [...new Map(userIdsToAdd.map(id => [id.toString(), id])).values()];

    // Atomic updates
    const updateOps: any = {
      $addToSet: { sharedWith: { $each: uniqueUserIds } },
    };

    // Merge accessGrants while preventing duplicates by type+value
    const existingGrants = Array.isArray(document.accessGrants) ? document.accessGrants : [];
    const existingKey = new Set(existingGrants.map((g: any) => `${g?.type}:${g?.value}`));
    const newGrants = grantEntriesToAdd.filter(g => !existingKey.has(`${g.type}:${g.value}`));
    if (newGrants.length > 0) {
      updateOps.$set = { accessGrants: [...existingGrants, ...newGrants] };
    }

    await db.collection("documents").updateOne(
      { _id: docId },
      updateOps
    );

    // Audit log (non-fatal on error)
    try {
      await db.collection('auditlogs').insertOne({
        user: requester._id,
        userEmail: requester.email,
        action: 'DOCUMENT_ACCESS_GRANTED',
        resource: document.name,
        details: `Type: ${type}; Values: ${values.join(', ')}`,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
        userAgent: request.headers.get('user-agent'),
        severity: 'info',
        category: 'document',
        timestamp: new Date()
      });
    } catch (e) {
      console.error('Audit log insert failed:', e);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
