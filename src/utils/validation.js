import { ObjectId } from "mongodb";

/**
 * Small helpers for validating values that come from the client.
 * Keeping them here means every route validates data the same way.
 */

/** MongoDB ids are 24 character hex strings. */
export function isValidObjectId(value) {
  return typeof value === "string" && /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Turns a valid id string into an ObjectId so it can be used in queries.
 * Returns null when the value is not a valid id.
 */
export function toObjectId(value) {
  return isValidObjectId(value) ? new ObjectId(value) : null;
}

/**
 * Returns the names of required fields that are missing or empty.
 *
 *   const missing = getMissingFields(req.body, ["serviceName", "price"]);
 *
 * A field counts as missing when it is undefined, null, an empty string or a
 * whitespace-only string.
 */
export function getMissingFields(body = {}, fields = []) {
  return fields.filter((field) => {
    const value = body[field];

    if (value === undefined || value === null) return true;
    if (typeof value === "string" && value.trim() === "") return true;

    return false;
  });
}
