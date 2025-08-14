import { MongoClient, ServerApiVersion } from "mongodb"

const uri = process.env.MONGODB_URI!;

const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  tlsAllowInvalidCertificates: true,
}

declare global {
  // Prevent TypeScript error in global scope during dev hot reloads
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

let client: MongoClient
let clientPromise: Promise<MongoClient>

if (!process.env.MONGODB_URI) {
  throw new Error("❌ MONGODB_URI not defined in environment variables")
}

if (process.env.NODE_ENV === "development") {
  // Use global variable in development to avoid creating many connections
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  // Always create a new client in production
  client = new MongoClient(uri, options)
  clientPromise = client.connect()
}

export default clientPromise
