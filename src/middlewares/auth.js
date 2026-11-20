import { createRemoteJWKSet, jwtVerify } from "jose";

import { getDb } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { isValidObjectId, toObjectId } from "../utils/validation.js";

/**
 * Better Auth (in the Next.js app) signs a JWT for the signed-in user.
 * It publishes the matching public keys at GET /api/auth/jwks, so the backend
 * can verify the signature without sharing any secret.
 *
 * createRemoteJWKSet fetches the keys once and caches them (and refreshes
 * them automatically when the keys rotate).
 */
const JWKS = createRemoteJWKSet(new URL("/api/auth/jwks", env.BETTER_AUTH_URL));

/** Reads `Authorization: Bearer <token>` and returns the token, or null. */
function getBearerToken(req) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice("Bearer ".length).trim();

  return token || null;
}

/**
 * Requires a valid JWT in the `Authorization` header and puts the user on
 * `req.user`.
 *
 * Responds with:
 *   401 – missing/invalid/expired token, or unknown account
 *   403 – the account has been blocked by an admin
 */
export async function authenticate(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "You must be signed in to access this resource.",
    });
  }

  // 1. Verify that the token was signed by Better Auth and is not expired.
  let payload;

  try {
    ({ payload } = await jwtVerify(token, JWKS));
  } catch (error) {
    logger.warning(`Token verification failed: ${error.message}`);

    return res.status(401).json({
      success: false,
      error: "Your session is invalid or has expired. Please sign in again.",
    });
  }

  // 2. Load the user from our database. Role and blocked status are read here
  //    (never from the token or the request body) so they are always current.
  try {
    const userId = payload.sub;

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        error: "Your session is invalid or has expired. Please sign in again.",
      });
    }

    const user = await getDb()
      .collection("user")
      .findOne({ _id: toObjectId(userId) });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Your account could not be found. Please sign in again.",
      });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        success: false,
        error: "Your account has been blocked. Please contact support.",
      });
    }

    const { _id, ...rest } = user;

    req.user = {
      id: _id.toString(),
      ...rest,
      role: rest.role ?? "customer",
      isBlocked: Boolean(rest.isBlocked),
      subscriptionPlan: rest.subscriptionPlan ?? "free",
    };

    return next();
  } catch (error) {
    logger.error(`User lookup failed: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not verify your session. Please try again.",
    });
  }
}

/**
 * Allows the request only when `req.user.role` is one of the given roles.
 * Must be used after `authenticate`.
 *
 *   router.post("/", authenticate, requireRole("vendor"), handler);
 */
export function requireRole(...roles) {
  return function roleMiddleware(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "You must be signed in to access this resource.",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `This action is only available to ${roles.join(" or ")} accounts.`,
      });
    }

    return next();
  };
}
