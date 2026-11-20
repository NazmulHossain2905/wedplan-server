import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { escapeRegex, isValidObjectId, toObjectId } from "../utils/validation.js";
import { toPublicUser, toSafeUser, USER_ROLES } from "../utils/users.js";

const router = Router();

const usersCollection = () => getDb().collection("user");

/**
 * GET /api/users – list, search and filter users. (Admin only)
 *
 * Query: ?q=text          search in name or email
 *        ?role=vendor      admin | vendor | customer
 *        ?page=1&limit=20  pagination
 */
router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  try {
    const { q, role } = req.query;

    const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit ?? "20", 10) || 20),
    );

    if (role && !USER_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        error: `Role must be one of: ${USER_ROLES.join(", ")}.`,
      });
    }

    const filter = {};

    if (q && String(q).trim()) {
      const pattern = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ name: pattern }, { email: pattern }];
    }

    if (role) filter.role = role;

    const total = await usersCollection().countDocuments(filter);

    const users = await usersCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      users: users.map(toSafeUser),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error(`Could not load users: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load users. Please try again.",
    });
  }
});

/**
 * GET /api/users/:id – user details.
 * Any signed-in user may look at another profile, but private fields (email,
 * phone, subscription and blocked status) are only shown to an admin or to
 * the owner of the account.
 */
router.get("/:id", authenticate, async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user id.",
      });
    }

    const user = await usersCollection().findOne({
      _id: toObjectId(req.params.id),
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
      });
    }

    const isSelf = req.user.id === req.params.id;
    const isAdmin = req.user.role === "admin";

    return res.status(200).json({
      success: true,
      user: isSelf || isAdmin ? toSafeUser(user) : toPublicUser(user),
    });
  } catch (error) {
    logger.error(`Could not load user: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load this user. Please try again.",
    });
  }
});

/** PATCH /api/users/:id/block – suspend an account. (Admin only) */
router.patch(
  "/:id/block",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      return await setBlocked(req, res, true);
    } catch (error) {
      logger.error(`Could not block user: ${error.message}`);

      return res.status(500).json({
        success: false,
        error: "Could not block this user. Please try again.",
      });
    }
  },
);

/** PATCH /api/users/:id/unblock – restore an account. (Admin only) */
router.patch(
  "/:id/unblock",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      return await setBlocked(req, res, false);
    } catch (error) {
      logger.error(`Could not unblock user: ${error.message}`);

      return res.status(500).json({
        success: false,
        error: "Could not unblock this user. Please try again.",
      });
    }
  },
);

async function setBlocked(req, res, isBlocked) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({
      success: false,
      error: "Invalid user id.",
    });
  }

  // Keeps an admin from locking themselves out of the dashboard.
  if (req.params.id === req.user.id) {
    return res.status(400).json({
      success: false,
      error: "You cannot change the blocked status of your own account.",
    });
  }

  const updated = await usersCollection().findOneAndUpdate(
    { _id: toObjectId(req.params.id) },
    { $set: { isBlocked, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) {
    return res.status(404).json({
      success: false,
      error: "User not found.",
    });
  }

  return res.status(200).json({
    success: true,
    message: isBlocked ? "User blocked." : "User unblocked.",
    user: toSafeUser(updated),
  });
}

/**
 * PATCH /api/users/:id/role – change a user's role. (Admin only)
 * Kept separate from the profile endpoint so a user can never change their
 * own role.
 */
router.patch(
  "/:id/role",
  authenticate,
  requireRole("admin"),
  async (req, res) => {
    try {
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid user id.",
        });
      }

      if (req.params.id === req.user.id) {
        return res.status(400).json({
          success: false,
          error: "You cannot change your own role.",
        });
      }

      const { role } = req.body ?? {};

      if (!USER_ROLES.includes(role)) {
        return res.status(400).json({
          success: false,
          error: `Role must be one of: ${USER_ROLES.join(", ")}.`,
        });
      }

      const updated = await usersCollection().findOneAndUpdate(
        { _id: toObjectId(req.params.id) },
        { $set: { role, updatedAt: new Date() } },
        { returnDocument: "after" },
      );

      if (!updated) {
        return res.status(404).json({
          success: false,
          error: "User not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: "User role updated.",
        user: toSafeUser(updated),
      });
    } catch (error) {
      logger.error(`Could not change role: ${error.message}`);

      return res.status(500).json({
        success: false,
        error: "Could not change this user's role. Please try again.",
      });
    }
  },
);

export default router;
