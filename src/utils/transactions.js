import { getDb } from "../config/db.js";
import { toPublicUser } from "./users.js";
import { toObjectId } from "./validation.js";

/**
 * Internal statuses:
 *   pending    -> a checkout session was created but not paid yet
 *   succeeded  -> Stripe confirmed the payment and Premium was activated
 *   failed     -> the checkout expired or Stripe could not be reached
 *   refunded   -> (reserved for future use)
 *
 * The frontend uses `paymentStatus`, with "processing" instead of "pending".
 * Both names are returned so old callers keep working.
 */
function toPaymentStatus(status) {
  if (status === "pending") return "processing";
  if (["succeeded", "failed", "refunded"].includes(status)) return status;

  return "processing";
}

/** Converts a transaction document into the shape the API returns. */
export function toTransaction(transaction) {
  const { _id, vendorId, ...rest } = transaction;
  const status = rest.status ?? "pending";

  return {
    id: _id.toString(),
    vendorId: String(vendorId),
    ...rest,
    status,
    paymentStatus: rest.paymentStatus ?? toPaymentStatus(status),
  };
}

/** Adds the vendor's public profile to each transaction (one query). */
export async function withTransactionVendors(transactions) {
  if (transactions.length === 0) return [];

  const vendorIds = [...new Set(transactions.map((t) => String(t.vendorId)))]
    .map(toObjectId)
    .filter(Boolean);

  const vendors = await getDb()
    .collection("user")
    .find({ _id: { $in: vendorIds } })
    .toArray();

  const vendorById = new Map(
    vendors.map((vendor) => [vendor._id.toString(), toPublicUser(vendor)]),
  );

  return transactions.map((transaction) => ({
    ...toTransaction(transaction),
    vendor: vendorById.get(String(transaction.vendorId)) ?? null,
  }));
}
