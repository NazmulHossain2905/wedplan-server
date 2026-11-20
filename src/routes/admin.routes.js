import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { toService, withVendors } from "../utils/services.js";
import {
  escapeRegex,
  isValidObjectId,
  toObjectId,
} from "../utils/validation.js";

const router = Router();

const servicesCollection = () => getDb().collection("service");

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

export default router;
