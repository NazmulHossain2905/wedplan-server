import { MongoClient } from "mongodb";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

let client = null;
let db = null;
let connection = null;

/**
 * Connects once and caches the promise, so index.js and the `ensureDb`
 * middleware never open two connections. A failed attempt clears the cache
 * so the next request can try again (important on serverless, where a
 * transient network error must not poison the whole instance).
 */
export async function connectToMongoDB() {
  if (db) return db;
  if (connection) return connection;

  connection = (async () => {
    try {
      client = new MongoClient(env.MONGODB_URI, {
        // Serverless creates many short-lived instances; a small pool per
        // instance keeps us under the Atlas connection limit.
        maxPoolSize: 5,
        // Fail fast instead of hanging until the platform times out (504).
        serverSelectionTimeoutMS: 3000,
      });
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
      connection = null;
      client = null;
      throw error;
    }
  })();

  return connection;
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
