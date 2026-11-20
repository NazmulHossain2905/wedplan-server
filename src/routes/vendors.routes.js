import { Router } from "express";

import { getDb } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { toSafeUser } from "../utils/users.js";
import { toObjectId } from "../utils/validation.js";

const router = Router();

/**
 * GET /api/vendors – vendors with at least one live service, for the home
 * page's "Featured Vendors" section. Public, two simple queries.
 */
router.get("/", async (req, res) => {
  try {
    const db = getDb();

    const liveServices = await db
      .collection("service")
      .find(
        { status: "approved", isAvailable: true },
        { projection: { vendorId: 1 } },
      )
      .toArray();

    const counts = new Map();

    for (const service of liveServices) {
      const id = String(service.vendorId);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const vendorIds = [...counts.keys()].map(toObjectId).filter(Boolean);

    const vendors = await db
      .collection("user")
      .find({ role: "vendor", _id: { $in: vendorIds } })
      .toArray();

    const result = vendors
      .map((vendor) => ({
        ...toSafeUser(vendor),
        activeServiceCount: counts.get(vendor._id.toString()) ?? 0,
      }))
      .sort((a, b) => b.activeServiceCount - a.activeServiceCount);

    return res.status(200).json({
      success: true,
      vendors: result,
      total: result.length,
    });
  } catch (error) {
    logger.error(`Could not load vendors: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load vendors. Please try again.",
    });
  }
});

export default router;
