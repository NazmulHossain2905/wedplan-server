/**
 * Shared helpers for shaping user documents that go out in API responses.
 *
 * MongoDB stores ids as `_id` ObjectIds, but the frontend expects a plain
 * `id` string. These helpers convert the document and hide fields that a user
 * should not see when looking at somebody else's account.
 */

export const USER_ROLES = ["admin", "vendor", "customer"];

/** Converts `_id` to `id` and removes the Mongo specific field. */
export function toSafeUser(user) {
  const { _id, ...rest } = user;

  return {
    id: _id.toString(),
    ...rest,
  };
}

/** The subset of a profile that is safe to show to other users. */
export function toPublicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    image: user.image ?? "",
    role: user.role ?? "customer",
    businessName: user.businessName ?? "",
    specialty: user.specialty ?? "",
    location: user.location ?? "",
    bio: user.bio ?? "",
    rating: user.rating ?? 0,
    completedWeddings: user.completedWeddings ?? 0,
    subscriptionPlan: user.subscriptionPlan ?? "free",
    joinedAt: user.joinedAt,
  };
}
