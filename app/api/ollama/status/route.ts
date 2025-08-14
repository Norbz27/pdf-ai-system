export async function GET() {
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
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