import { logger } from "../utils/logger.js";

/** Sent when no route matched the request. */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} was not found.`,
  });
}

/**
 * Catches every error that reaches the end of the middleware chain so the
 * client always receives JSON instead of an HTML error page.
 */
export function errorHandler(error, req, res, next) {
  logger.error(error.message || "Unknown server error");

  // express.json() throws this when the body is not valid JSON.
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      error: "The request body is not valid JSON.",
    });
  }

  return res.status(500).json({
    success: false,
    error: "Something went wrong on the server. Please try again.",
  });
}
