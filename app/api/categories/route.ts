import clientPromise from "@/lib/mongodb";

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("DocuMind_AI");
    
    const categories = await db.collection("categories").find({}).sort({ name: 1 }).toArray();
    
    return new Response(JSON.stringify({ categories }), { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
  }
} 