import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import {
  BOOKING_STATUSES,
  withBookingDetails,
} from "../utils/bookings.js";
import { getMissingFields, isValidObjectId, toObjectId } from "../utils/validation.js";

const router = Router();

const bookingsCollection = () => getDb().collection("booking");
const servicesCollection = () => getDb().collection("service");

// Every route in this file needs a signed-in user.
router.use(authenticate);

/**
 * POST /api/bookings – create a booking request. (Customer only)
 *
 * Body: { serviceId, eventDate, eventLocation, message? }
 * The vendor is taken from the service, never from the request body.
 */
router.post("/", requireRole("customer"), async (req, res) => {
  try {
    const body = req.body ?? {};

    const missing = getMissingFields(body, [
      "serviceId",
      "eventDate",
      "eventLocation",
    ]);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(", ")}.`,
      });
    }

    if (!isValidObjectId(body.serviceId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid service id.",
      });
    }

    const eventDate = new Date(body.eventDate);

    if (Number.isNaN(eventDate.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Event date is not a valid date.",
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    if (eventDate < startOfToday) {
      return res.status(400).json({
        success: false,
        error: "Event date cannot be in the past.",
      });
    }

    if (body.message !== undefined && typeof body.message !== "string") {
      return res.status(400).json({
        success: false,
        error: "Message must be text.",
      });
    }

    const service = await servicesCollection().findOne({
      _id: toObjectId(body.serviceId),
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    if (service.status !== "approved" || !service.isAvailable) {
      return res.status(400).json({
        success: false,
        error: "This service is not available for booking.",
      });
    }

    if (String(service.vendorId) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot book your own service.",
      });
    }

    const customerId = toObjectId(req.user.id);

    // One active booking per service per event date for the same customer.
    const dayStart = new Date(eventDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const duplicate = await bookingsCollection().findOne({
      serviceId: service._id,
      customerId,
      eventDate: { $gte: dayStart, $lt: dayEnd },
      status: { $in: ["pending", "accepted"] },
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        error:
          "You already have an active booking for this service on that date.",
      });
    }

    const now = new Date();

    const booking = {
      serviceId: service._id,
      vendorId: service.vendorId,
      customerId,
      eventDate,
      eventLocation: body.eventLocation.trim(),
      message: (body.message ?? "").trim(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await bookingsCollection().insertOne(booking);

    const [withDetails] = await withBookingDetails([
      { _id: insertedId, ...booking },
    ]);

    return res.status(201).json({
      success: true,
      message: "Booking request sent to the vendor.",
      booking: withDetails,
    });
  } catch (error) {
    logger.error(`Could not create booking: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not create this booking. Please try again.",
    });
  }
});

/** GET /api/bookings – the signed-in customer's bookings. (Customer only) */
router.get("/", requireRole("customer"), async (req, res) => {
  try {
    const filter = { customerId: toObjectId(req.user.id) };
    const { status } = req.query;

    if (status !== undefined) {
      if (!BOOKING_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Status must be one of: ${BOOKING_STATUSES.join(", ")}.`,
        });
      }

      filter.status = status;
    }

    const bookings = await bookingsCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      bookings: await withBookingDetails(bookings),
      total: bookings.length,
    });
  } catch (error) {
    logger.error(`Could not load bookings: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load your bookings. Please try again.",
    });
  }
});

/**
 * GET /api/bookings/:id – one booking with service, vendor and customer.
 * Only the customer, the vendor or an admin may read it.
 */
router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid booking id.",
      });
    }

    const booking = await bookingsCollection().findOne({
      _id: toObjectId(req.params.id),
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found.",
      });
    }

    const isCustomer = String(booking.customerId) === req.user.id;
    const isVendor = String(booking.vendorId) === req.user.id;
    const isAdmin = req.user.role === "admin";

    if (!isCustomer && !isVendor && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: "You do not have access to this booking.",
      });
    }

    const [withDetails] = await withBookingDetails([booking], {
      includeCustomer: true,
    });

    return res.status(200).json({
      success: true,
      booking: withDetails,
    });
  } catch (error) {
    logger.error(`Could not load booking: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load this booking. Please try again.",
    });
  }
});

/** PATCH /api/bookings/:id/cancel – cancel your own pending booking. */
router.patch("/:id/cancel", requireRole("customer"), async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid booking id.",
      });
    }

    const booking = await bookingsCollection().findOne({
      _id: toObjectId(req.params.id),
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "Booking not found.",
      });
    }

    if (String(booking.customerId) !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only cancel your own bookings.",
      });
    }

    if (booking.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "Only pending bookings can be cancelled.",
      });
    }

    const updated = await bookingsCollection().findOneAndUpdate(
      { _id: booking._id },
      { $set: { status: "cancelled", updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    const [withDetails] = await withBookingDetails([updated]);

    return res.status(200).json({
      success: true,
      message: "Booking cancelled.",
      booking: withDetails,
    });
  } catch (error) {
    logger.error(`Could not cancel booking: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not cancel this booking. Please try again.",
    });
  }
});

export default router;
