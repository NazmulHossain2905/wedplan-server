import { env } from "../config/env.js";
import { FREE_ACTIVE_SERVICE_LIMIT } from "./subscription.js";

/**
 * The plans a vendor can be on.
 * `maxActiveServices: null` means unlimited.
 */

export const FREE_PLAN = {
  id: "free",
  name: "Free",
  price: 0,
  currency: env.STRIPE_CURRENCY,
  maxActiveServices: FREE_ACTIVE_SERVICE_LIMIT,
  features: [
    "Up to 3 pending or approved services",
    "Basic vendor dashboard",
    "Booking request management",
    "Public vendor profile",
  ],
};

export const PREMIUM_PLAN = {
  id: "premium",
  name: "Premium",
  price: env.PREMIUM_PRICE,
  currency: env.STRIPE_CURRENCY,
  maxActiveServices: null,
  durationDays: env.PREMIUM_DURATION_DAYS,
  features: [
    "Unlimited Services",
    "Premium Vendor Badge",
    "All Free Plan Features",
  ],
};
