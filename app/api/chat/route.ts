import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const MAX_CONTEXT_LENGTH = 2000; // Reduce context to 2000 characters for faster Ollama response
const CHUNKS_PER_DOC = 1; // Limit to 1 top chunk per doc for testing speed

type Chunk = { text: string; chunkIndex: number; doc?: any; score?: number; embedding?: number[] };

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";

// Network hardening
const EMBED_TIMEOUT_MS = 20000; // 20s for embedding calls
const GENERATE_TIMEOUT_MS = 60000; // 60s for generation
const MAX_SEMANTIC_CHUNKS = 100; // cap semantic ranking set size

// Minimal doc typing (avoid DOM Document name collision)
interface DocRecord {
  _id: ObjectId;
  name?: string;
  originalname?: string;
  filename?: string;
  title?: string;
  chunks?: Chunk[];
  uploadedBy?: ObjectId | string;
  sharedWith?: (ObjectId | string)[];
}

// Abortable fetch with timeout
async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(resource, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function getRelevantChunksKeyword(chunks: Chunk[], question: string): Chunk[] {
  // Simple keyword search: rank by number of question words present
  const keywords = question.toLowerCase().split(/\W+/).filter(Boolean);
  return chunks
    .map((chunk: Chunk) => ({
      ...chunk,
      score: keywords.reduce((acc: number, word: string) => acc + (chunk.text.toLowerCase().includes(word) ? 1 : 0), 0)
    }))
    .sort((a: Chunk, b: Chunk) => (b.score || 0) - (a.score || 0));
}

// Semantic search: compare query embedding to chunk embeddings
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text: string): Promise<number[]> {
  const ollamaUrl = OLLAMA_URL;
  const res = await fetchWithTimeout(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text })
  }, EMBED_TIMEOUT_MS);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Embedding API error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.embedding || [];
}

async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const ollamaUrl = OLLAMA_URL;
  if (texts.length > 1) {
    try {
      const res = await fetchWithTimeout(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", prompt: texts })
      }, EMBED_TIMEOUT_MS);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embeddings)) return data.embeddings;
        if (Array.isArray(data.embedding)) return [data.embedding];
        if (data.embedding) return [data.embedding];
        throw new Error("No embeddings returned from Ollama");
      } else {
        const errText = await res.text().catch(() => "");
        console.warn("Ollama batch embedding not supported, falling back to sequential.", errText);
      }
    } catch (err) {
      console.warn("Batch embedding failed, falling back to sequential.", err);
    }
  }
  const results: number[][] = [];
  for (const text of texts) {
    const res = await fetchWithTimeout(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "nomic-embed-text", prompt: text })
    }, EMBED_TIMEOUT_MS);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
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



export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { docIds, question, cachedDocs } = body;
    const userIdStr = body?.user?._id;
    let userObjectId: ObjectId | null = null;
    if (userIdStr && ObjectId.isValid(userIdStr)) {
      userObjectId = new ObjectId(userIdStr);
    }
    if (!question) {
      return new Response(JSON.stringify({ message: "Missing question" }), { status: 400 });
    }

    // Only fetch from DB if user requests document listing or if no cachedDocs provided
    let docs;
    const normalizedQuestion = question.trim().toLowerCase();
    const listDocIntents = [
      "list documents", "list of documents", "show documents", "what documents do you have", "what files are uploaded", "show me the documents", "which documents are available", "which files do you know", "what files do you know", "what documents are there", "give me a list of documents", "give me a list of files", "show all documents", "show all files"
    ];
    if (listDocIntents.some(intent => normalizedQuestion.includes(intent)) || !cachedDocs) {
      const dbStart = Date.now();
      const client = await clientPromise;
      const db = client.db("DocuMind_AI");
      const accessFilter = userObjectId
        ? { $or: [{ uploadedBy: userObjectId }, { sharedWith: { $in: [userObjectId] } }] }
        : {};
      if (docIds && Array.isArray(docIds) && docIds.length > 0) {
        const idFilter = {
          _id: {
            $in: docIds.filter((id: string) => typeof id === 'string' && ObjectId.isValid(id)).map((id: string) => new ObjectId(id))
          }
        };
        docs = await db.collection("documents").find({ ...idFilter, ...accessFilter }).toArray();
      } else {
        docs = await db.collection("documents").find(accessFilter).toArray();
      }
      const dbEnd = Date.now();
      console.log("DB fetch time (ms):", dbEnd - dbStart);
    } else {
      // Use cached docs but enforce access control
      if (userObjectId) {
        docs = (cachedDocs || []).filter((doc: any) => {
          const uploadedByMatch = doc.uploadedBy?.toString?.() === userIdStr;
          const sharedMatch = Array.isArray(doc.sharedWith) && doc.sharedWith.some((id: any) => id?.toString?.() === userIdStr);
          return uploadedByMatch || sharedMatch;
        });
      } else {
        docs = [];
      }
    }
    
    // Special command: list documents (natural language intent detection)
    // (listDocIntents already declared above)
    if (listDocIntents.some(intent => normalizedQuestion.includes(intent))) {
      // Dynamically generate a natural-sounding response listing documents
      const docList = docs.map((doc: any) => ({
        id: doc._id.toString(),
        name: doc.name || doc.originalname || doc.filename || doc.title || "Untitled Document"
      }));
      let answer = "";
      if (docList.length === 0) {
        answer = "I currently don't have any documents uploaded.";
      } else if (docList.length === 1) {
        answer = `I have one document: ${docList[0].name}`;
      } else {
        answer = `Here are the documents I know about:`;
        answer += "\n" + docList.map((d: { id: string; name: string }, i: number) => `${i + 1}. ${d.name}`).join("\n");
      }
      return new Response(JSON.stringify({ answer }), { status: 200 });
    }
    
    // Ensure embeddings exist for chunks (batch first, then sequential fallback)
async function ensureEmbeddings(chunks: Chunk[]) {
  const missing = chunks.filter(c => !Array.isArray(c.embedding) || c.embedding.length === 0);
  if (missing.length === 0) return;
  const texts = missing.map(c => c.text);
  const embeddings = await getEmbeddingsBatch(texts);
  missing.forEach((chunk, idx) => {
    chunk.embedding = embeddings[idx];
  });
}

function buildSelectedChunks(ranked: Chunk[]): Chunk[] {
  const docChunkMap: { [key: string]: number } = {};
  const selected: Chunk[] = [];
  let totalLength = 0;
  for (const chunk of ranked) {
    const docId = chunk.doc?._id?.toString?.() || "unknown";
    docChunkMap[docId] = docChunkMap[docId] || 0;
    if (docChunkMap[docId] < CHUNKS_PER_DOC) {
      if (totalLength + chunk.text.length > MAX_CONTEXT_LENGTH) break;
      selected.push(chunk);
      docChunkMap[docId]++;
      totalLength += chunk.text.length;
    }
  }
  return selected;
}

async function selectRelevantChunks(docs: DocRecord[], question: string): Promise<Chunk[]> {
  try {
    const normalizedQuestion = question.trim().toLowerCase();
    const allChunks: Chunk[] = docs.flatMap((doc: any) => (doc.chunks || []).map((chunk: any) => ({ ...chunk, doc })));
    const matchedDocs = docs.filter((doc: any) => {
      const docName = (doc.name || doc.originalname || doc.filename || doc.title || "Untitled Document").toLowerCase();
      return normalizedQuestion.includes(docName);
    });
    const candidateChunks = (matchedDocs.length > 0)
      ? allChunks.filter(c => matchedDocs.some(d => d._id?.toString?.() === c.doc?._id?.toString?.()))
      : allChunks;

    if (candidateChunks.length === 0) return [];

    // Limit for semantic processing
    const limited = candidateChunks.length > MAX_SEMANTIC_CHUNKS ? candidateChunks.slice(0, MAX_SEMANTIC_CHUNKS) : candidateChunks;

    // Try semantic ranking
    const chunksWithEmbeds = limited.filter(c => Array.isArray(c.embedding) && c.embedding.length > 0);
    if (chunksWithEmbeds.length === limited.length) {
      const queryEmbedding = await getEmbedding(question);
      const ranked = limited
        .map(c => ({ ...c, score: cosineSimilarity(queryEmbedding, c.embedding!) }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));
      return buildSelectedChunks(ranked);
    }

    // Embed missing and rank
    await ensureEmbeddings(limited);
    const queryEmbedding = await getEmbedding(question);
    const ranked = limited
      .filter(c => Array.isArray(c.embedding) && c.embedding.length > 0)
      .map(c => ({ ...c, score: cosineSimilarity(queryEmbedding, c.embedding!) }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    if (ranked.length > 0) return buildSelectedChunks(ranked);

    // Fallback: keyword
    const keywordRanked = getRelevantChunksKeyword(limited, question);
    return buildSelectedChunks(keywordRanked);
  } catch (err) {
    console.warn("Semantic selection failed, using keyword fallback:", err);
    // Fallback: keyword on all docs
    const allChunks: Chunk[] = docs.flatMap((doc: any) => (doc.chunks || []).map((chunk: any) => ({ ...chunk, doc })));
    const keywordRanked = getRelevantChunksKeyword(allChunks, question);
    return buildSelectedChunks(keywordRanked);
  }
}

// Handle generic greetings without sending document context to Ollama
    const greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "__greeting__"];
    if (greetings.some(greet => normalizedQuestion === greet)) {
      // Use Ollama to generate a dynamic greeting response with the same model as document Q&A
      const ollamaUrl = OLLAMA_URL;
      const ollamaModel = OLLAMA_MODEL;
      let prompt;
      if (normalizedQuestion === "__greeting__" && body.user) {
        prompt = `Greet the user by name and introduce yourself as Oxy, their AI assistant. Mention you can help with their uploaded documents, generate summaries, and answer questions. Personalize the greeting for: Name: ${body.user.name || "User"}, Role: ${body.user.role || "Unknown"}.  Be concise`;
      } else {
        prompt = `You are Oxy, a friendly AI assistant. Greet the user and offer help. Be concise.`;
      }
      const startOllama = Date.now();
      const ollamaRes = await fetchWithTimeout(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ollamaModel, prompt, stream: false })
      }, GENERATE_TIMEOUT_MS);
      const endOllama = Date.now();
      console.log("Ollama API response time (ms):", endOllama - startOllama);
      if (!ollamaRes.ok) {
        console.error("Ollama API error:", ollamaRes.status, ollamaRes.statusText);
        return new Response(JSON.stringify({ answer: `Hello ${body.user?.name || "User"}! I'm your AI assistant. How can I help you today?` }), { status: 200 });
      }
      const ollamaData = await ollamaRes.json();
      const answer = ollamaData.response || `Hello ${body.user?.name || "User"}! I'm Oxy, your AI assistant. How can I help you today?`;
      return new Response(JSON.stringify({ answer }), { status: 200 });
    }
    
    // --- Document matching and chunk retrieval (refactored) ---
    let userDetails = "";
    const selectedChunks: Chunk[] = await selectRelevantChunks((docs as DocRecord[]), question);
    let context = selectedChunks.map(chunk => chunk.text).join("\n\n").slice(0, MAX_CONTEXT_LENGTH);
    if (body.user && typeof body.user === 'object') {
      userDetails = `\n\nUser Info:\nName: ${body.user.name || "Unknown"}\nEmail: ${body.user.email || "Unknown"}\nRole: ${body.user.role || "Unknown"}`;
    }
    // Only send the introductory prompt once per session (first message)
    let prompt;
    const isFirstMessage = body.isFirstMessage === true;
    if (context) {
      prompt = `You are Oxy, an expert document assistant of a company Oxytec Solutions Inc. Use ONLY the following document content to answer the user's question. Do not use outside knowledge. Use the term company instead of from the document. Respond with proper formating like indention, header, listing, table, etc. Specify where you found the info like what page or section on the end of your respond.\n\nDocument Content:\n${context}${userDetails}\n\nUser Question: ${question}\n\nAnswer:`;
    } else if (isFirstMessage) {
      prompt = `You are Oxy, a helpful AI assistant. Answer the user's question. If the user asks about documents, let them know you can analyze them if requested.`;
      if (body.user && typeof body.user === 'object') {
        prompt += `\n\nUser Info:\nName: ${body.user.name || "Unknown"}\nEmail: ${body.user.email || "Unknown"}\nRole: ${body.user.role || "Unknown"}`;
      }
      prompt += `\n\nUser Question: ${question}\n\nAnswer:`;
    } else {
      // For subsequent messages, just send the user's question
      prompt = question;
    }
    console.debug("Ollama prompt length:", prompt.length);

    // Call Ollama API directly
    const ollamaUrl = OLLAMA_URL;
    const ollamaModel = OLLAMA_MODEL;
    const startOllama = Date.now();
    const ollamaRes = await fetchWithTimeout(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel, prompt, stream: false })
    }, GENERATE_TIMEOUT_MS);
    const endOllama = Date.now();
    console.log("Ollama API response time (ms):", endOllama - startOllama);
    if (!ollamaRes.ok) {
      console.error("Ollama API error:", ollamaRes.status, ollamaRes.statusText);
      return new Response(JSON.stringify({ answer: `Hello ${body.user?.name || "User"}! I'm your AI assistant. How can I help you today?` }), { status: 200 });
    }
    const ollamaData = await ollamaRes.json();
    const answer = ollamaData.response || `Hello ${body.user?.name || "User"}! I'm Oxy, your AI assistant. How can I help you today?`;
    return new Response(JSON.stringify({ answer }), { status: 200 });
  } catch (error) {
    console.error("Server error:", error);
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
}



