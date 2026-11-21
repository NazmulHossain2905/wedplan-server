import { MongoClient } from "mongodb";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let client = null;
let db = null;
let connection = null;

/**
 * Connects once and caches the promise, so calling this from index.js and
 * from the serverless entry point at the same time is safe.
 */
export async function connectToMongoDB() {
  if (db) return db;
  if (connection) return connection;

  connection = (async () => {
    try {
      client = new MongoClient(env.MONGODB_URI);
      await client.connect();
      db = client.db(env.DB_NAME);

      // Indexes for the fields every list/count endpoint filters on.
      await Promise.all([
        db.collection("service").createIndex({ status: 1, isAvailable: 1, createdAt: -1 }),
        db.collection("service").createIndex({ category: 1, location: 1 }),
        db.collection("booking").createIndex({ customerId: 1, createdAt: -1 }),
        db.collection("booking").createIndex({ vendorId: 1, status: 1 }),
        db.collection("booking").createIndex({ serviceId: 1, eventDate: 1 }),
        db.collection("transaction").createIndex({ stripeSessionId: 1 }),
        db.collection("transaction").createIndex({ vendorId: 1, createdAt: -1 }),
        db.collection("user").createIndex({ role: 1 }),
      ]);

      logger.success(
        `You successfully connected to MongoDB (database: ${env.DB_NAME})!`,
      );
      return db;
    } catch (error) {
      logger.error(`Failed to connect to MongoDB: ${error.message}`);
      connection = null; // allow a retry on the next request
      throw error;
    }
  })();

  return connection;
}

/**
 * On Vercel the Express app may be imported directly by the serverless
 * function instead of through index.js. Connecting at module load guarantees
 * every entry point has a database before it handles a request.
 */
try {
  await connectToMongoDB();
} catch {
  // getDb() below reports the failure per request; don't stop the app from
  // loading so health checks and non-DB routes still respond.
}

export function isDbConnected() {
  return Boolean(db);
}

export function getDb() {
  if (!db) {
    throw new Error(
      "MongoDB is not connected. Check MONGODB_URI and DB_NAME in the server environment.",
    );
  }
  return db;
}

export function getClient() {
  if (!client) {
    throw new Error("MongoDB is not connected.");
  }
  return client;
}
