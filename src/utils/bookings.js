import { getDb } from "../config/db.js";
import { toObjectId } from "./validation.js";
import { toService } from "./services.js";
import { toPublicUser } from "./users.js";

/** Allowed booking statuses. */
export const BOOKING_STATUSES = ["pending", "accepted", "rejected", "cancelled"];

/** Converts `_id` and the id fields to strings for API responses. */
export function toBooking(booking) {
  const { _id, serviceId, vendorId, customerId, ...rest } = booking;

  return {
    id: _id.toString(),
    serviceId: String(serviceId),
    vendorId: String(vendorId),
    customerId: String(customerId),
    ...rest,
  };
}

/** Turns an array of id strings into ObjectIds, skipping invalid ones. */
function toObjectIds(values) {
  return [...new Set(values.map(String))].map(toObjectId).filter(Boolean);
}

/**
 * Adds the related service, vendor (and optionally customer) documents to each
 * booking, using one query per collection.
 */
export async function withBookingDetails(bookings, { includeCustomer = false } = {}) {
  if (bookings.length === 0) return [];

  const db = getDb();

  const serviceIds = toObjectIds(bookings.map((b) => b.serviceId));
  const vendorIds = toObjectIds(bookings.map((b) => b.vendorId));
  const customerIds = includeCustomer
    ? toObjectIds(bookings.map((b) => b.customerId))
    : [];

  const [services, vendors, customers] = await Promise.all([
    db.collection("service").find({ _id: { $in: serviceIds } }).toArray(),
    db.collection("user").find({ _id: { $in: vendorIds } }).toArray(),
    includeCustomer
      ? db.collection("user").find({ _id: { $in: customerIds } }).toArray()
      : Promise.resolve([]),
  ]);

  const serviceById = new Map(
    services.map((service) => [service._id.toString(), toService(service)]),
  );
  const vendorById = new Map(
    vendors.map((vendor) => [vendor._id.toString(), toPublicUser(vendor)]),
  );
  const customerById = new Map(
    customers.map((customer) => [customer._id.toString(), toPublicUser(customer)]),
  );

  return bookings.map((booking) => {
    const result = {
      ...toBooking(booking),
      service: serviceById.get(String(booking.serviceId)) ?? null,
      vendor: vendorById.get(String(booking.vendorId)) ?? null,
    };

    if (includeCustomer) {
      result.customer = customerById.get(String(booking.customerId)) ?? null;
    }

    return result;
  });
}
