import { Router } from "express";

import { getDb } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { withVendor, withVendors } from "../utils/services.js";
import {
  escapeRegex,
  isValidObjectId,
  toObjectId,
} from "../utils/validation.js";

const router = Router();

const servicesCollection = () => getDb().collection("service");

/** Sorting options the public list understands. */
const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  recommended: { createdAt: -1 },
  "price-asc": { price: 1 },
  "price-desc": { price: -1 },
};

/**
 * GET /api/services – public list of services.
 *
 * Only approved services that the vendor has marked as available are shown.
 *
 * Query: ?q=text          search in service name or description
 *        ?category=...    exact category (case-insensitive)
 *        ?location=...    exact location (case-insensitive)
 *        ?minPrice=0&maxPrice=100000
 *        ?sort=newest | recommended | price-asc | price-desc
 *        ?page=1&limit=12
 */
router.get("/", async (req, res) => {
  try {
    const { q, category, location, minPrice, maxPrice } = req.query;

    const sortKey = req.query.sort ?? "newest";

    if (!SORT_OPTIONS[sortKey]) {
      return res.status(400).json({
        success: false,
        error: `Sort must be one of: ${Object.keys(SORT_OPTIONS).join(", ")}.`,
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page ?? "1", 10) || 1);
    const limit = Math.min(
      60,
      Math.max(1, Number.parseInt(req.query.limit ?? "12", 10) || 12),
    );

    const filter = { status: "approved", isAvailable: true };

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

    if (location && String(location).trim()) {
      filter.location = new RegExp(
        `^${escapeRegex(String(location).trim())}$`,
        "i",
      );
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        const value = Number(minPrice);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            error: "minPrice must be a number of 0 or more.",
          });
        }
        filter.price.$gte = value;
      }

      if (maxPrice !== undefined) {
        const value = Number(maxPrice);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({
            success: false,
            error: "maxPrice must be a number of 0 or more.",
          });
        }
        filter.price.$lte = value;
      }
    }

    // Locations come from live services only, so the filter never offers a
    // location that has nothing to show.
    const [total, locations, services] = await Promise.all([
      servicesCollection().countDocuments(filter),
      servicesCollection().distinct("location", {
        status: "approved",
        isAvailable: true,
        location: { $nin: ["", null] },
      }),
      servicesCollection()
        .find(filter)
        .sort(SORT_OPTIONS[sortKey])
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
    ]);

    return res.status(200).json({
      success: true,
      services: await withVendors(services),
      total,
      locations: locations.filter(Boolean).sort(),
      page,
      limit,
    });
  } catch (error) {
    logger.error(`Could not load services: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load services. Please try again.",
    });
  }
});

/**
 * GET /api/services/:id – public service details.
 * Pending or unavailable services are not shown (vendors and admins can see
 * them through their own dashboards).
 */
router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid service id.",
      });
    }

    const service = await servicesCollection().findOne({
      _id: toObjectId(req.params.id),
    });

    if (!service || service.status !== "approved" || !service.isAvailable) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    return res.status(200).json({
      success: true,
      service: await withVendor(service),
    });
  } catch (error) {
    logger.error(`Could not load service: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load this service. Please try again.",
    });
  }
});

export default router;
