import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { BOOKING_STATUSES, withBookingDetails } from "../utils/bookings.js";
import { logger } from "../utils/logger.js";
import { toService, withVendors } from "../utils/services.js";
import { withTransactionVendors } from "../utils/transactions.js";
import { toSafeUser, USER_ROLES } from "../utils/users.js";
import {
  escapeRegex,
  isValidObjectId,
  toObjectId,
} from "../utils/validation.js";

const router = Router();

const usersCollection = () => getDb().collection("user");
const servicesCollection = () => getDb().collection("service");
const bookingsCollection = () => getDb().collection("booking");
const transactionsCollection = () => getDb().collection("transaction");

const SERVICE_STATUSES = ["pending", "approved", "rejected"];

/** Statuses an admin can set from the review screen. */
const REVIEW_STATUSES = ["approved", "rejected"];

// Every route in this file is for admins only.
router.use(authenticate, requireRole("admin"));

/**
 * GET /api/admin/services – every service, including pending and rejected.
 *
 * Query: ?status=pending|approved|rejected
 *        ?q=text          search in service name or description
 *        ?category=...
 *        ?page=1&limit=20
 */
router.get("/services", async (req, res) => {
  try {
    const { status, q, category } = req.query;

    if (status !== undefined && !SERVICE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${SERVICE_STATUSES.join(", ")}.`,
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit ?? "20", 10) || 20),
    );

    const filter = {};

    if (status) filter.status = status;

    if (q && String(q).trim()) {
      const pattern = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ serviceName: pattern }, { description: pattern }];
    }

    if (category && String(category).trim()) {
      filter.category = new RegExp(
        `^${escapeRegex(String(category).trim())}$`,
        "i",
      );
    }

    const total = await servicesCollection().countDocuments(filter);

    const services = await servicesCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      services: await withVendors(services),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error(`Could not load services for admin: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load services. Please try again.",
    });
  }
});

/** PATCH /api/admin/services/:id/status – approve or reject a service. */
router.patch("/services/:id/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid service id.",
      });
    }

    const { status } = req.body ?? {};

    if (!REVIEW_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${REVIEW_STATUSES.join(", ")}.`,
      });
    }

    const updated = await servicesCollection().findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: status === "approved" ? "Service approved." : "Service rejected.",
      service: toService(updated),
    });
  } catch (error) {
    logger.error(`Could not change service status: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not update this service. Please try again.",
    });
  }
});

/** DELETE /api/admin/services/:id – remove any service. */
router.delete("/services/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid service id.",
      });
    }

    const result = await servicesCollection().deleteOne({
      _id: toObjectId(req.params.id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service deleted.",
    });
  } catch (error) {
    logger.error(`Could not delete service: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not delete this service. Please try again.",
    });
  }
});

/** GET /api/admin/stats – numbers shown on the admin dashboard. */
router.get("/stats", async (req, res) => {
  try {
    const db = getDb();

    const [
      totalUsers,
      totalVendors,
      totalCustomers,
      totalServices,
      pendingServices,
      totalTransactions,
      paidTransactions,
    ] = await Promise.all([
      db.collection("user").countDocuments(),
      db.collection("user").countDocuments({ role: "vendor" }),
      db.collection("user").countDocuments({ role: "customer" }),
      db.collection("service").countDocuments(),
      db.collection("service").countDocuments({ status: "pending" }),
      db.collection("transaction").countDocuments(),
      db.collection("transaction")
        .find({ status: "succeeded" }, { projection: { amount: 1 } })
        .toArray(),
    ]);

    const totalRevenue = paidTransactions.reduce(
      (sum, transaction) => sum + (Number(transaction.amount) || 0),
      0,
    );

    return res.status(200).json({
      success: true,
      totalUsers,
      totalVendors,
      totalCustomers,
      totalServices,
      pendingServices,
      totalTransactions,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    });
  } catch (error) {
    logger.error(`Could not load admin stats: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load the dashboard numbers. Please try again.",
    });
  }
});

/**
 * GET /api/admin/users – every account, with activity counts.
 *
 * Query: ?q=text     search in name or email
 *        ?role=...   admin | vendor | customer
 */
router.get("/users", async (req, res) => {
  try {
    const { q, role } = req.query;

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

    const users = await usersCollection()
      .find(filter)
      .sort({ joinedAt: -1, createdAt: -1 })
      .toArray();

    const result = await Promise.all(
      users.map(async (user) => {
        const [serviceCount, bookingCount, requestCount] = await Promise.all([
          servicesCollection().countDocuments({ vendorId: user._id }),
          bookingsCollection().countDocuments({ customerId: user._id }),
          bookingsCollection().countDocuments({ vendorId: user._id }),
        ]);

        return {
          ...toSafeUser(user),
          serviceCount,
          bookingCount,
          requestCount,
        };
      }),
    );

    return res.status(200).json({
      success: true,
      users: result,
      total: result.length,
    });
  } catch (error) {
    logger.error(`Could not load users for admin: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load users. Please try again.",
    });
  }
});

/** PATCH /api/admin/users/:id/status – block or unblock an account. */
router.patch("/users/:id/status", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user id.",
      });
    }

    // Otherwise an admin could sign themselves out of the dashboard forever.
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot change the blocked status of your own account.",
      });
    }

    const { isBlocked } = req.body ?? {};

    if (typeof isBlocked !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "isBlocked must be true or false.",
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
  } catch (error) {
    logger.error(`Could not change user status: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not update this user. Please try again.",
    });
  }
});

/**
 * PATCH /api/admin/services/:id/availability – show or hide a service.
 * The review status (pending/approved/rejected) is deliberately untouched.
 */
router.patch("/services/:id/availability", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid service id.",
      });
    }

    const { isAvailable } = req.body ?? {};

    if (typeof isAvailable !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "isAvailable must be true or false.",
      });
    }

    const updated = await servicesCollection().findOneAndUpdate(
      { _id: toObjectId(req.params.id) },
      { $set: { isAvailable, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: isAvailable ? "Service is now visible." : "Service is now hidden.",
      service: toService(updated),
    });
  } catch (error) {
    logger.error(`Could not change service availability: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not update this service. Please try again.",
    });
  }
});

/**
 * GET /api/admin/bookings – all bookings on the platform.
 *
 * Query: ?status=pending|accepted|rejected|cancelled
 *        ?page=1&limit=20
 */
router.get("/bookings", async (req, res) => {
  try {
    const { status } = req.query;

    if (status !== undefined && !BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${BOOKING_STATUSES.join(", ")}.`,
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit ?? "20", 10) || 20),
    );

    const filter = {};
    if (status) filter.status = status;

    const total = await bookingsCollection().countDocuments(filter);

    const bookings = await bookingsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    return res.status(200).json({
      success: true,
      bookings: await withBookingDetails(bookings, { includeCustomer: true }),
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error(`Could not load bookings for admin: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load bookings. Please try again.",
    });
  }
});

/** GET /api/admin/transactions – all payment records, with vendor profiles. */
router.get("/transactions", async (req, res) => {
  try {
    const transactions = await transactionsCollection()
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      transactions: await withTransactionVendors(transactions),
      total: transactions.length,
    });
  } catch (error) {
    logger.error(`Could not load transactions for admin: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load transactions. Please try again.",
    });
  }
});

export default router;
