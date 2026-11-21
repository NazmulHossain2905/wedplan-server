import { connectToMongoDB } from "../config/db.js";
import { logger } from "../utils/logger.js";

/**
 * Makes sure MongoDB is connected before any route handler runs.
 *
 * The express app can be invoked directly by a serverless function on Vercel,
 * so we cannot rely on index.js having called connectToMongoDB(). The
 * connection promise is cached in db.js, so after the first request this is
 * effectively free. If the connection fails, the cache is cleared and the
 * next request tries again.
 */
export async function ensureDb(req, res, next) {
  try {
    await connectToMongoDB();
    return next();
  } catch (error) {
    logger.error(`Database unavailable: ${error.message}`);

    return res.status(503).json({
      success: false,
      error: "Database is temporarily unavailable. Please try again.",
    });
  }
}
