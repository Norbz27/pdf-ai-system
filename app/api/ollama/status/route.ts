export async function GET() {
  try {
    const response = await fetch(process.env.OLLAMA_URL + "/api/tags", {
      method: "GET",
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ online: false }), { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify({ 
      online: true, 
      models: data.models || [] 
    }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Ollama status check failed:", error);
    return new Response(JSON.stringify({ online: false }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
} 