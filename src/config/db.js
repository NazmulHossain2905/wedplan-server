import { MongoClient } from "mongodb";
import { logger } from "../utils/logger.js";

let client = null;
let db = null;

export async function connectToMongoDB() {
  try {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db("wedplan");
    logger.success("You successfully connected to MongoDB!");
    return db;
  } catch (err) {
    logger.error("Failed to connect to MongoDB");
    console.dir(err);
    throw err;
  }
}

export function getDb() {
  if (!db) {
    throw new Error("MongoDB is not connected. Call connectToMongoDB() first.");
  }
  return db;
}

export function getClient() {
  if (!client) {
    throw new Error("MongoDB is not connected. Call connectToMongoDB() first.");
  }
  return client;
}
