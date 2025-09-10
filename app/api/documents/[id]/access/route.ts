import { NextRequest, NextResponse } from 'next/server';
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    const { type, values } = await request.json();

    if (!type || !values || !Array.isArray(values) || values.length === 0) {
      return NextResponse.json({ error: 'Type and values array are required' }, { status: 400 });
    }

    const document = await db.collection("documents").findOne({ _id: new ObjectId(params.id) });
    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!document.sharedWith) {
      document.sharedWith = [];
    }
    if (!document.accessGrants) {
      document.accessGrants = [];
    }

    if (type === 'name') {
      for (const name of values) {
        const user = await db.collection("users").findOne({ name });
        if (user && !document.sharedWith.some((id: ObjectId) => id.equals(user._id))) {
          document.sharedWith.push(user._id);
          document.accessGrants.push({
            type: 'user',
            value: name,
            grantedAt: new Date()
          });
        }
      }
    } else if (type === 'role') {
      for (const roleName of values) {
        const role = await db.collection("roles").findOne({ name: roleName });
        if (role) {
          const usersInRole = await db.collection("users").find({ role: role._id }).toArray();
          for (const user of usersInRole) {
            if (!document.sharedWith.some((id: ObjectId) => id.equals(user._id))) {
              document.sharedWith.push(user._id);
            }
          }
          document.accessGrants.push({
            type: 'role',
            value: role._id.toString(),
            grantedAt: new Date()
          });
        }
      }
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    await db.collection("documents").updateOne(
      { _id: new ObjectId(params.id) },
      { $set: { sharedWith: document.sharedWith, accessGrants: document.accessGrants } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
