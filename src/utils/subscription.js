/**
 * Subscription helpers.
 *
 * Premium is stored on the user document (subscriptionPlan +
 * subscriptionExpiresAt) and is only changed by the Stripe webhook or an
 * admin. These helpers decide what the current plan allows.
 */

/** Free vendors may keep at most this many active services. */
export const FREE_ACTIVE_SERVICE_LIMIT = 3;

/**
 * True when the user has a premium subscription that has not expired.
 * A premium plan without an expiry date is treated as active.
 */
export function isPremiumActive(user) {
  if (!user || user.subscriptionPlan !== "premium") return false;
  if (!user.subscriptionExpiresAt) return true;

  return new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}
