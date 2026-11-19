import "dotenv/config";

import { logger } from "../utils/logger.js";

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    logger.error(`Missing required environment variable: ${name}`);
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function optionalEnv(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const env = {
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  PORT: Number(optionalEnv("PORT", "5000")),

  MONGODB_URI: requireEnv("MONGODB_URI"),
  DB_NAME: optionalEnv("DB_NAME", "wedplan"),

  // Comma-separated list is supported, e.g. "http://localhost:3000,https://app.example.com"
  CLIENT_URL: optionalEnv("CLIENT_URL", "http://localhost:3000"),
};

export const allowedOrigins = env.CLIENT_URL.split(",").map((origin) =>
  origin.trim(),
);
