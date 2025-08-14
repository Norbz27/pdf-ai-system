import { NextRequest } from "next/server";
import { createReadStream, statSync } from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("filePath");
    const fileName = searchParams.get("fileName") || "document.pdf";
    if (!filePath) {
      return new Response("Missing filePath", { status: 400 });
    }
    const absPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    // Check if file exists
    let stat;
    try {
      stat = statSync(absPath);
    } catch {
      return new Response("File not found", { status: 404 });
    }
    // Stream the file
    const stream = createReadStream(absPath);
    return new Response(stream as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": stat.size.toString(),
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Server error", { status: 500 });
  }
} 