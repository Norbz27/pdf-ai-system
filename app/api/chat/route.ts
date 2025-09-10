import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const MAX_CONTEXT_LENGTH = 2000; // Reduce context to 2000 characters for faster Ollama response
const CHUNKS_PER_DOC = 1; // Limit to 1 top chunk per doc for testing speed

type Chunk = { text: string; chunkIndex: number; doc?: any; score?: number; embedding?: number[] };

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
  // Use fast embedding model for semantic search
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const res = await fetch(`${ollamaUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", prompt: text })
  });
  if (!res.ok) throw new Error("Embedding API error");
  const data = await res.json();
  return data.embedding || [];
}

async function getEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  // Try batch embedding (if supported by Ollama)
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
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

async function getRelevantChunks(chunks: Chunk[], question: string): Promise<Chunk[]> {
  // Semantic search: embed question, compare to chunk embeddings
  const queryEmbedding = await getEmbedding(question);

  // Find chunks missing embeddings
  const chunksMissingEmbeddings = chunks.filter(chunk => !chunk.embedding || !Array.isArray(chunk.embedding));
  if (chunksMissingEmbeddings.length > 0) {
    // Batch embedding API call for missing chunk embeddings
    const batchTexts = chunksMissingEmbeddings.map(chunk => chunk.text);
    const batchEmbeddings = await getEmbeddingsBatch(batchTexts);
    chunksMissingEmbeddings.forEach((chunk, idx) => {
      chunk.embedding = batchEmbeddings[idx];
    });
  }

  // Only rank chunks with embeddings
  return chunks
    .filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
    .map((chunk: Chunk) => {
      let score = cosineSimilarity(queryEmbedding, chunk.embedding!);
      return { ...chunk, score };
    })
    .sort((a: Chunk, b: Chunk) => (b.score || 0) - (a.score || 0));
}

// --- Add session-aware greeting logic ---
// Helper: get session greeting for user
async function getSessionGreeting(user: any) {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:3b";
  const name = user?.name || "User";
  const email = user?.email || "Unknown";
  const role = user?.role || "Unknown";
  const prompt = `Greet the user by name and introduce yourself as their AI assistant. Mention you can help with their uploaded documents, generate summaries, and answer questions. Personalize the greeting for: Name: ${name}, Email: ${email}, Role: ${role}.`;
  const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: ollamaModel, prompt, stream: false })
  });
  if (!ollamaRes.ok) {
    return `Hello ${name}! I'm your AI assistant. How can I help you today?`;
  }
  const ollamaData = await ollamaRes.json();
  return ollamaData.response || `Hello ${name}! I'm your AI assistant. How can I help you today?`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { docIds, question, cachedDocs } = body;
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
      if (docIds && Array.isArray(docIds) && docIds.length > 0) {
        docs = await db.collection("documents").find({ _id: { $in: docIds.map((id: string) => typeof id === 'string' ? new ObjectId(id) : id) } }).toArray();
      } else {
        docs = await db.collection("documents").find({}).toArray();
      }
      const dbEnd = Date.now();
      console.log("DB fetch time (ms):", dbEnd - dbStart);
    } else {
      docs = cachedDocs;
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
    
    // Handle generic greetings without sending document context to Ollama
    const greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "__greeting__"];
    if (greetings.some(greet => normalizedQuestion === greet)) {
      // Use Ollama to generate a dynamic greeting response with the same model as document Q&A
      const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
      const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2:3b";
      let prompt;
      if (normalizedQuestion === "__greeting__" && body.user) {
        prompt = `Greet the user by name and introduce yourself as Oxy, their AI assistant. Mention you can help with their uploaded documents, generate summaries, and answer questions. Personalize the greeting for: Name: ${body.user.name || "User"}, Role: ${body.user.role || "Unknown"}.  Be concise`;
      } else {
        prompt = `You are Oxy, a friendly AI assistant. Greet the user and offer help. Be concise.`;
      }
      const startOllama = Date.now();
      const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          stream: false
        })
      });
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
    
    // --- Document matching and chunk retrieval for every question ---
    let selectedChunks: Chunk[] = [];
    let context = "";
    let userDetails = "";
    // Gather all document chunks
    let allChunks: Chunk[] = docs.flatMap((doc: any) => (doc.chunks || []).map((chunk: any) => ({ ...chunk, doc })));
    // Step 1: Match document names
    const matchedDocs = docs.filter((doc: any) => {
      const docName = (doc.name || doc.originalname || doc.filename || doc.title || "Untitled Document").toLowerCase();
      return normalizedQuestion.includes(docName);
    });
    let relevantChunks: Chunk[] = [];
    if (matchedDocs.length > 0) {
      // Step 2: For matched docs, search their chunks for question matches
      const matchedDocIds = matchedDocs.map((doc: any) => doc._id.toString());
      const matchedDocChunks = allChunks.filter(chunk => matchedDocIds.includes(chunk.doc._id.toString()));
      // Step 3: Semantic search and keyword search on chunks
      const chunksWithEmbeddings = matchedDocChunks.filter(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
      if (chunksWithEmbeddings.length > 0) {
        // Limit to top 100 chunks for semantic search
        const limitedChunks = chunksWithEmbeddings.length > 100 ? chunksWithEmbeddings.slice(0, 100) : chunksWithEmbeddings;
        // Only embed missing chunk embeddings (should be rare)
        const missingEmbeddings = limitedChunks.filter(chunk => !chunk.embedding || !Array.isArray(chunk.embedding));
        if (missingEmbeddings.length > 0) {
          const batchTexts = missingEmbeddings.map(chunk => chunk.text);
          const batchEmbeddings = await getEmbeddingsBatch(batchTexts);
          missingEmbeddings.forEach((chunk, idx) => {
            chunk.embedding = batchEmbeddings[idx];
          });
        }
        // Embed question once
        const queryEmbedding = await getEmbedding(question);
        // Score and sort
        relevantChunks = limitedChunks.map(chunk => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding!) }))
          .sort((a, b) => (b.score || 0) - (a.score || 0));
      } else {
        // Fallback: keyword search if no embeddings
        relevantChunks = getRelevantChunksKeyword(matchedDocChunks, question);
      }
    } else {
      // If no document name matches, search all chunks for relevance
      const chunksWithEmbeddings = allChunks.filter(chunk => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);
      if (chunksWithEmbeddings.length > 0) {
        const limitedChunks = chunksWithEmbeddings.length > 100 ? chunksWithEmbeddings.slice(0, 100) : chunksWithEmbeddings;
        const missingEmbeddings = limitedChunks.filter(chunk => !chunk.embedding || !Array.isArray(chunk.embedding));
        if (missingEmbeddings.length > 0) {
          const batchTexts = missingEmbeddings.map(chunk => chunk.text);
          const batchEmbeddings = await getEmbeddingsBatch(batchTexts);
          missingEmbeddings.forEach((chunk, idx) => {
            chunk.embedding = batchEmbeddings[idx];
          });
        }
        const queryEmbedding = await getEmbedding(question);
        relevantChunks = limitedChunks.map(chunk => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding!) }))
          .sort((a, b) => (b.score || 0) - (a.score || 0));
      } else {
        relevantChunks = getRelevantChunksKeyword(allChunks, question);
      }
    }
    // Select top chunks for context (limit by doc, then by total length)
    const docChunkMap: { [key: string]: number } = {};
    let totalLength = 0;
    for (const chunk of relevantChunks) {
      const docId = chunk.doc._id.toString();
      docChunkMap[docId] = docChunkMap[docId] || 0;
      // Limit to CHUNKS_PER_DOC per document
      if (docChunkMap[docId] < CHUNKS_PER_DOC) {
        if (totalLength + chunk.text.length > MAX_CONTEXT_LENGTH) break;
        selectedChunks.push(chunk);
        docChunkMap[docId]++;
        totalLength += chunk.text.length;
      }
    }
    context = selectedChunks.map(chunk => chunk.text).join("\n\n").slice(0, MAX_CONTEXT_LENGTH);
    if (body.user && typeof body.user === 'object') {
      userDetails = `\n\nUser Info:\nName: ${body.user.name || "Unknown"}\nEmail: ${body.user.email || "Unknown"}\nRole: ${body.user.role || "Unknown"}`;
    }
    // Only send the introductory prompt once per session (first message)
    let prompt;
    const isFirstMessage = body.isFirstMessage === true;
    if (context) {
      prompt = `You are Oxy, an expert document assistant of Oxytec Solutions Inc. Use ONLY the following document content to answer the user's question. Do not use outside knowledge. Use the term company instead of from the document. Respond with proper formating like indention, header, listing, table, etc. Specify where you found the info like what page or section on the end of your respond.\n\nDocument Content:\n${context}${userDetails}\n\nUser Question: ${question}\n\nAnswer:`;
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
    console.log("Prompt sent to Ollama:\n", prompt);

    // Call Ollama API directly
    const ollamaUrl = process.env.OLLAMA_URL;
    const ollamaModel = process.env.OLLAMA_MODEL;
    const startOllama = Date.now();
    const ollamaRes = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: prompt,
        stream: false
      })
    });
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



