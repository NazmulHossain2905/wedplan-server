import { getDb } from "../config/db.js";
import { toObjectId } from "./validation.js";
import { toPublicUser } from "./users.js";

/**
 * Shapes a service document for API responses: `_id` becomes `id` and
 * `vendorId` becomes a string.
 */
export function toService(service) {
  const { _id, vendorId, ...rest } = service;

  return {
    id: _id.toString(),
    vendorId: String(vendorId),
    ...rest,
  };
}

/**
 * Adds the vendor's public profile to each service, so the frontend can show
 * "by <vendor>" without extra requests. Uses one query for all vendors.
 */
export async function withVendors(services) {
  if (services.length === 0) return [];

  const vendorIds = [...new Set(services.map((s) => String(s.vendorId)))]
    .map(toObjectId)
    .filter(Boolean);

  const vendors = await getDb()
    .collection("user")
    .find({ _id: { $in: vendorIds } })
    .toArray();

  const vendorById = new Map(
    vendors.map((vendor) => [vendor._id.toString(), toPublicUser(vendor)]),
  );

  return services.map((service) => ({
    ...toService(service),
    vendor: vendorById.get(String(service.vendorId)) ?? null,
  }));
}

/** Same as withVendors, for a single service document. */
export async function withVendor(service) {
  const [result] = await withVendors([service]);
  return result;
}
