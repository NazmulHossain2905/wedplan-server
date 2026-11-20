import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { toObjectId } from "../utils/validation.js";

const router = Router();

// Every route here is for signed-in customers only.
router.use(authenticate, requireRole("customer"));

/** GET /api/customer/stats – the signed-in customer's booking numbers. */
router.get("/stats", async (req, res) => {
  try {
    const bookings = await getDb()
      .collection("booking")
      .find(
        { customerId: toObjectId(req.user.id) },
        { projection: { status: 1 } },
      )
      .toArray();

    const count = (status) => bookings.filter((b) => b.status === status).length;

    return res.status(200).json({
      success: true,
      totalBookings: bookings.length,
      pending: count("pending"),
      accepted: count("accepted"),
      rejected: count("rejected"),
    });
  } catch (error) {
    logger.error(`Could not load customer stats: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load your booking statistics. Please try again.",
    });
  }
});

export default router;
