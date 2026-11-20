import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { isValidUrl, toObjectId } from "../utils/validation.js";
import { toSafeUser } from "../utils/users.js";

const router = Router();

const usersCollection = () => getDb().collection("user");

/** Fields a user is allowed to edit on their own account. */
const EDITABLE_FIELDS = [
  "name",
  "image",
  "businessName",
  "specialty",
  "location",
  "phone",
  "bio",
];

/** Fields that only the backend (or an admin) may change. */
const PROTECTED_FIELDS = [
  "id",
  "_id",
  "email",
  "role",
  "isBlocked",
  "emailVerified",
  "subscriptionPlan",
  "subscriptionExpiresAt",
  "joinedAt",
  "rating",
  "completedWeddings",
  "password",
];

/** GET /api/profile – the signed-in user's own profile. */
router.get("/", authenticate, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

/**
 * PATCH /api/profile – update the signed-in user's own profile.
 *
 * Only EDITABLE_FIELDS are accepted. Sending a protected field (role,
 * isBlocked, subscriptionPlan, email, ...) returns 400 so the attempt is
 * never silently ignored.
 */
router.patch("/", authenticate, async (req, res) => {
  try {
    const body = req.body ?? {};

    const protectedFields = PROTECTED_FIELDS.filter(
      (field) => body[field] !== undefined,
    );

    if (protectedFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `You cannot change these fields: ${protectedFields.join(", ")}.`,
      });
    }

    const update = {};

    for (const field of EDITABLE_FIELDS) {
      if (body[field] === undefined) continue;

      if (typeof body[field] !== "string") {
        return res.status(400).json({
          success: false,
          error: `${field} must be text.`,
        });
      }

      update[field] = body[field].trim();
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({
        success: false,
        error: `Provide at least one field to update: ${EDITABLE_FIELDS.join(", ")}.`,
      });
    }

    if (update.name !== undefined && update.name === "") {
      return res.status(400).json({
        success: false,
        error: "Name cannot be empty.",
      });
    }

    if (update.image !== undefined && update.image !== "" && !isValidUrl(update.image)) {
      return res.status(400).json({
        success: false,
        error: "Image must be a valid http(s) URL.",
      });
    }

    const updated = await usersCollection().findOneAndUpdate(
      { _id: toObjectId(req.user.id) },
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "Your account could not be found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated.",
      user: toSafeUser(updated),
    });
  } catch (error) {
    logger.error(`Could not update profile: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not update your profile. Please try again.",
    });
  }
});

export default router;
