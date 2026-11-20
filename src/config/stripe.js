import Stripe from "stripe";

import { env } from "./env.js";

/**
 * Stripe client.
 *
 * It is `null` when no secret key is configured so the server still starts
 * during local development. Routes that need Stripe check for this and reply
 * with a clear error instead of crashing.
 */
export const stripe = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : null;
