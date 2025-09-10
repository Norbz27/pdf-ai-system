import clientPromise from "@/lib/mongodb";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";
import { ObjectId } from "mongodb";
import { auditLogger } from "@/lib/audit-logger";
// Use global fetch available in Node.js v18+ and Next.js

export const config = {
  api: {
    bodyParser: false,
  },
};

function chunkText(text: string, chunkSize: number = 1000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({ text: text.slice(i, i + chunkSize), chunkIndex: Math.floor(i / chunkSize) });
  }
  return chunks;
}

// Enhanced chunking: tag with page/section, embed for semantic search
function chunkTextWithMeta(text: string, pages: number, chunkSize: number = 1000) {
  // Simple split by chunkSize, but tag with page/section
  const chunks = [];
  let page = 1;
  let section = 1;
  for (let i = 0; i < text.length; i += chunkSize) {
    // Placeholder: In real use, extract page/section from PDF structure
    const chunkText = text.slice(i, i + chunkSize);
    // Placeholder for vector embedding
    const embedding = null; // Replace with actual embedding if available
    chunks.push({
      text: chunkText,
      chunkIndex: Math.floor(i / chunkSize),
      page,
      section,
      embedding,
    });
    // Optionally increment page/section if you have logic
    if ((i + chunkSize) / text.length > page / pages) page++;
    section++;
  }
  return chunks;
}

async function extractTextAndPageCountFromPDF(buffer: Buffer): Promise<{ text: string, pages: number }> {
  const data = await pdfParse(buffer);
  return { text: data.text, pages: data.numpages };
}

async function getEmbedding(text: string): Promise<number[]> {
  // Call Ollama embedding API
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const res = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama3.1", prompt: text })
  });
  if (!res.ok) throw new Error("Embedding API error");
  const data = await res.json();
  return data.embedding || [];
}

async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Try batch embedding (if supported by Ollama)
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  let batchSupported = false;
  // Only send batch if more than one text
  if (texts.length > 1) {
    try {
      const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: texts })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embeddings)) return data.embeddings;
        if (Array.isArray(data.embedding)) return [data.embedding];
        if (data.embedding) return [data.embedding];
        throw new Error("No embeddings returned from Ollama");
      } else {
        const errText = await res.text();
        console.warn("Ollama batch embedding not supported, falling back to sequential.", errText);
      }
    } catch (err) {
      console.warn("Batch embedding failed, falling back to sequential.", err);
    }
  }
  // Fallback: sequential embedding
  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`Ollama embedding error (${res.status}):`, errText);
      throw new Error(`Embedding API error: ${res.status} - ${errText}`);
    }
    const data = await res.json();
    if (Array.isArray(data.embedding)) results.push(data.embedding);
    else if (data.embedding) results.push(data.embedding);
    else throw new Error("No embedding returned from Ollama");
  }
  return results;
}

async function chunkTextWithMetaAndEmbeddings(text: string, pages: number, chunkSize: number = 1000) {
  const chunks = [];
  let page = 1;
  let section = 1;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunkText = text.slice(i, i + chunkSize);
    chunks.push({
      text: chunkText,
      chunkIndex: Math.floor(i / chunkSize),
      page,
      section,
      embedding: null as number[] | null,
    });
    if ((i + chunkSize) / text.length > page / pages) page++;
    section++;
  }
  // Batch embed all chunk texts
  const embeddingAllStart = Date.now();
  const batchTexts = chunks.map(chunk => chunk.text);
  const batchEmbeddings = await getEmbeddingsBatch(batchTexts);
  for (let idx = 0; idx < chunks.length; idx++) {
    chunks[idx].embedding = batchEmbeddings[idx];
  }
  const embeddingAllEnd = Date.now();
  console.log("Total embedding time for all chunks:", embeddingAllEnd - embeddingAllStart, "ms");
  return chunks;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const categoryId = formData.get("categoryId");
    const description = formData.get("description") || "";
    const uploadedBy = formData.get("uploadedBy");

    if (!file || !categoryId || !uploadedBy || !(file instanceof Blob)) {
      return new Response(JSON.stringify({ message: "Missing required fields" }), { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db("DocuMind_AI");

    // Get IP address and user agent for audit logging
    const ipAddress = req.headers.get('x-forwarded-for') ||
                     req.headers.get('x-real-ip') ||
                     'unknown'
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Verify category exists
    const category = await db.collection("categories").findOne({ _id: new ObjectId(categoryId as string) });
    if (!category) {
      return new Response(JSON.stringify({ message: "Category not found" }), { status: 404 });
    }

    // Verify user exists
    const user = await db.collection("users").findOne({ _id: new ObjectId(uploadedBy as string) });
    if (!user) {
      return new Response(JSON.stringify({ message: "User not found" }), { status: 404 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Save file to uploads directory
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = (file as any).name || `upload-${Date.now()}.pdf`;
    const uniqueFileName = `${Date.now()}_${fileName}`;
    const filePath = path.join(uploadsDir, uniqueFileName);
    await writeFile(filePath, buffer);

    // Extract text and page count from PDF using pdf-parse
    const { text, pages } = await extractTextAndPageCountFromPDF(buffer);
    const embeddingAllStart = Date.now();
    const chunks = await chunkTextWithMetaAndEmbeddings(text, pages, 1000);
    const embeddingAllEnd = Date.now();
    console.log("Total embedding time for all chunks:", embeddingAllEnd - embeddingAllStart, "ms");

    // Format file size as string (e.g., "0.1 MB")
    const formatFileSize = (bytes: number) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // Store in MongoDB with exact database structure
    const result = await db.collection("documents").insertOne({
      name: fileName,
      categoryId: new ObjectId(categoryId as string),
      description: description as string,
      size: formatFileSize(buffer.length),
      filePath: `public/uploads/${uniqueFileName}`,
      pages,
      chunks, // Now includes page, section, embedding
      uploadedBy: new ObjectId(uploadedBy as string),
      status: "processing",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Log successful document upload
    await auditLogger.documentUpload(
      user.name,
      user.email,
      fileName,
      formatFileSize(buffer.length),
      pages,
      ipAddress
    )

    return new Response(JSON.stringify({ message: "Saved", id: result.insertedId }), { status: 200 });
  } catch (error) {
    console.error(error);

    // Log failed document upload using system error
    try {
      const formData = await req.formData();
      const uploadedBy = formData.get("uploadedBy");
      const file = formData.get("file");

      if (uploadedBy) {
        const client = await clientPromise;
        const db = client.db("DocuMind_AI");
        const user = await db.collection("users").findOne({ _id: new ObjectId(uploadedBy as string) });

        if (user) {
          const ipAddress = req.headers.get('x-forwarded-for') ||
                           req.headers.get('x-real-ip') ||
                           'unknown'
          const fileName = (file as any)?.name || 'unknown'

          await auditLogger.systemError(
            user.name,
            user.email,
            `Document upload failed: ${fileName} - ${error instanceof Error ? error.message : 'Unknown error'}`,
            ipAddress
          )
        }
      }
    } catch (auditError) {
      console.error("Failed to log audit event:", auditError)
    }

    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
}
