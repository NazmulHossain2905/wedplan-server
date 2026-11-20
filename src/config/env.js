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

// Comma-separated list is supported, e.g. "http://localhost:3000,https://app.example.com"
const clientUrlSetting = optionalEnv("CLIENT_URL", "http://localhost:3000");

const clientOrigins = clientUrlSetting
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const env = {
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  PORT: Number(optionalEnv("PORT", "5000")),

  MONGODB_URI: requireEnv("MONGODB_URI"),
  DB_NAME: optionalEnv("DB_NAME", "wedplan"),

  CLIENT_URL: clientUrlSetting,

  /**
   * Base URL of the app that runs Better Auth (the Next.js client).
   * The backend asks this server who owns a session cookie, so authentication
   * stays in one place. Defaults to the first CLIENT_URL origin.
   */
  BETTER_AUTH_URL: optionalEnv("BETTER_AUTH_URL", clientOrigins[0]),
};

export const allowedOrigins = clientOrigins;
