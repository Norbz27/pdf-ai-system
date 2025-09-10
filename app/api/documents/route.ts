import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { unlink } from "fs/promises";
import path from "path";
import { auditLogger } from "@/lib/audit-logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fileName, categoryId, description, size, uploadedBy } = body;

    if (!fileName || !categoryId || !size || !uploadedBy) {
      return new Response(JSON.stringify({ message: "Missing required fields" }), { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    // Get IP address and user agent for audit logging
    const ipAddress = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown'

    // Verify category exists
    const category = await db.collection("categories").findOne({ _id: new ObjectId(categoryId) });
    if (!category) {
      return new Response(JSON.stringify({ message: "Category not found" }), { status: 404 });
    }

    // Verify user exists
    const user = await db.collection("users").findOne({ _id: new ObjectId(uploadedBy) });
    if (!user) {
      return new Response(JSON.stringify({ message: "User not found" }), { status: 404 });
    }

    const result = await db.collection("documents").insertOne({
      name: fileName,
      categoryId: new ObjectId(categoryId),
      description: description || "",
      size,
      uploadedBy: new ObjectId(uploadedBy),
      status: "uploaded",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Log successful document creation
    await auditLogger.documentUpload(
      user.name,
      user.email,
      fileName,
      size,
      undefined, // pages not available in this API
      ipAddress
    )

    return new Response(JSON.stringify({ message: "Saved", id: result.insertedId }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");
    const userRole = url.searchParams.get("userRole");

    let matchStage = {};
    if (userId && userId !== 'null' && userId !== 'undefined') {
      try {
        const objectId = new ObjectId(userId);
        if (userRole && userRole !== 'null' && userRole !== 'undefined') {
          matchStage = {
            $or: [
              { uploadedBy: objectId },
              { sharedWith: { $in: [objectId] } },
              { accessGrants: { $elemMatch: { type: 'role', value: userRole } } }
            ]
          };
        } else {
          matchStage = {
            $or: [
              { uploadedBy: objectId },
              { sharedWith: { $in: [objectId] } }
            ]
          };
        }
      } catch (error) {
        // Invalid ObjectId, no filter
        matchStage = {};
      }
    } else if (userRole && userRole !== 'null' && userRole !== 'undefined') {
      matchStage = {
        accessGrants: { $elemMatch: { type: 'role', value: userRole } }
      };
    }

    // Aggregate documents with category and user information
    const documents = await db.collection("documents").aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "category"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "uploadedBy",
          foreignField: "_id",
          as: "uploader"
        }
      },
      {
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $unwind: {
          path: "$uploader",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          size: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          categoryName: "$category.name",
          uploaderName: "$uploader.name",
          uploadedBy: 1,
          pages: 1,
          filePath: 1,
          sharedWith: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]).toArray();

    return new Response(JSON.stringify({ documents }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return new Response(JSON.stringify({ message: "Missing id" }), { status: 400 });
    }
    const client = await clientPromise;
    const db = client.db("DocuMind_AI");
    const doc = await db.collection("documents").findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return new Response(JSON.stringify({ message: "Document not found" }), { status: 404 });
    }

    // Get IP address and user agent for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     'unknown'

    // Remove file from uploads directory if filePath exists
    if (doc.filePath) {
      const absPath = path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath);
      try {
        await unlink(absPath);
      } catch (e) {
        // Ignore file not found errors
      }
    }

    await db.collection("documents").deleteOne({ _id: new ObjectId(id) });

    // Get user information for audit logging
    const user = await db.collection("users").findOne({ _id: doc.uploadedBy });
    if (user) {
      // Log document deletion
      await auditLogger.documentDelete(
        user.name,
        user.email,
        doc.name,
        ipAddress
      );
    }

    return new Response(JSON.stringify({ message: "Deleted" }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
}
