import { Router } from "express";

import { getDb } from "../config/db.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { BOOKING_STATUSES, withBookingDetails } from "../utils/bookings.js";
import { logger } from "../utils/logger.js";
import { toService } from "../utils/services.js";
import {
  FREE_ACTIVE_SERVICE_LIMIT,
  isPremiumActive,
} from "../utils/subscription.js";
import { toTransaction } from "../utils/transactions.js";
import {
  getMissingFields,
  isValidObjectId,
  isValidUrl,
  toObjectId,
} from "../utils/validation.js";

const router = Router();

const SERVICE_CATEGORIES = [
  "Photography & Videography",
  "Wedding Venues",
  "Decoration & Florist",
  "Catering Services",
  "Makeup & Styling",
  "Wedding Fashion",
];

const servicesCollection = () => getDb().collection("service");
const bookingsCollection = () => getDb().collection("booking");
const transactionsCollection = () => getDb().collection("transaction");

/** Everything a vendor must send when creating a service. */
const REQUIRED_FIELDS = [
  "serviceName",
  "category",
  "description",
  "price",
  "location",
  "images",
];

/** Fields only an admin (or the system) may change. */
const PROTECTED_FIELDS = [
  "id",
  "_id",
  "vendorId",
  "status",
  "createdAt",
  "rating",
  "reviews",
  "featured",
];

const SERVICE_STATUSES = ["pending", "approved", "rejected"];

// Every route in this file is for signed-in vendors only.
router.use(authenticate, requireRole("vendor"));

/**
 * Reads and validates the service fields that a vendor may write.
 * Missing fields are skipped here and reported by the caller, so the same
 * function works for "create" (all fields required) and "update" (partial).
 */
function readServiceFields(body = {}) {
  const data = {};

  const textFields = {
    serviceName: "Service name",
    category: "Category",
    description: "Description",
    location: "Location",
  };

  for (const [field, label] of Object.entries(textFields)) {
    if (body[field] === undefined) continue;

    if (typeof body[field] !== "string" || body[field].trim() === "") {
      return { error: `${label} is required and must be text.` };
    }

    data[field] = body[field].trim();
  }

  if (data.category !== undefined && !SERVICE_CATEGORIES.includes(data.category)) {
    return {
      error: `Category must be one of: ${SERVICE_CATEGORIES.join(", ")}.`,
    };
  }

  if (body.price !== undefined) {
    const price = Number(body.price);

    if (!Number.isFinite(price) || price <= 0) {
      return { error: "Price must be a number greater than 0." };
    }

    data.price = price;
  }

  if (body.images !== undefined) {
    if (!Array.isArray(body.images) || body.images.length === 0) {
      return { error: "Add at least one image URL." };
    }

    if (!body.images.every(isValidUrl)) {
      return { error: "Every image must be a valid http(s) URL." };
    }

    data.images = body.images.map((url) => url.trim());
  }

  if (body.isAvailable !== undefined) {
    if (typeof body.isAvailable !== "boolean") {
      return { error: "isAvailable must be true or false." };
    }

    data.isAvailable = body.isAvailable;
  }

  return { data };
}

/** GET /api/vendor/services – the signed-in vendor's own services. */
router.get("/services", async (req, res) => {
  try {
    const filter = { vendorId: toObjectId(req.user.id) };
    const { status } = req.query;

    if (status !== undefined) {
      if (!SERVICE_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `Status must be one of: ${SERVICE_STATUSES.join(", ")}.`,
        });
      }

      filter.status = status;
    }

    const services = await servicesCollection()
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      services: services.map(toService),
      total: services.length,
    });
  } catch (error) {
    logger.error(`Could not load vendor services: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load your services. Please try again.",
    });
  }
});

/**
 * POST /api/vendor/services – create a service.
 *
 * New services start as "pending" and only become public after an admin
 * approves them. Free vendors may keep at most 3 active services.
 */
router.post("/services", async (req, res) => {
  try {
    const body = req.body ?? {};

    const missing = getMissingFields(body, REQUIRED_FIELDS);

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(", ")}.`,
      });
    }

    const { data, error } = readServiceFields(body);

    if (error) {
      return res.status(400).json({ success: false, error });
    }

    const vendorId = toObjectId(req.user.id);

    if (!isPremiumActive(req.user)) {
      const activeCount = await servicesCollection().countDocuments({
        vendorId,
        status: "approved",
        isAvailable: true,
      });

      if (activeCount >= FREE_ACTIVE_SERVICE_LIMIT) {
        return res.status(403).json({
          success: false,
          error: `The Free plan allows ${FREE_ACTIVE_SERVICE_LIMIT} active services. Upgrade to Premium for unlimited services.`,
        });
      }
    }

    const now = new Date();

    const service = {
      ...data,
      vendorId,
      isAvailable: data.isAvailable ?? true,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await servicesCollection().insertOne(service);

    return res.status(201).json({
      success: true,
      message: "Service created and waiting for admin approval.",
      service: toService({ _id: insertedId, ...service }),
    });
  } catch (error) {
    logger.error(`Could not create service: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not create this service. Please try again.",
    });
  }
});

/** PATCH /api/vendor/services/:id – update one of the vendor's services. */
router.patch("/services/:id", async (req, res) => {
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

    if (!service) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    if (String(service.vendorId) !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own services.",
      });
    }

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

    const { data, error } = readServiceFields(body);

    if (error) {
      return res.status(400).json({ success: false, error });
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Provide at least one field to update.",
      });
    }

    // Re-activating a service counts towards the Free plan limit.
    if (
      data.isAvailable === true &&
      service.isAvailable === false &&
      !isPremiumActive(req.user)
    ) {
      const activeCount = await servicesCollection().countDocuments({
        vendorId: toObjectId(req.user.id),
        status: "approved",
        isAvailable: true,
      });

      if (activeCount >= FREE_ACTIVE_SERVICE_LIMIT) {
        return res.status(403).json({
          success: false,
          error: `The Free plan allows ${FREE_ACTIVE_SERVICE_LIMIT} active services. Upgrade to Premium for unlimited services.`,
        });
      }
    }

    const updated = await servicesCollection().findOneAndUpdate(
      { _id: service._id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );

    return res.status(200).json({
      success: true,
      message: "Service updated.",
      service: toService(updated),
    });
  } catch (error) {
    logger.error(`Could not update service: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not update this service. Please try again.",
    });
  }
});

/** DELETE /api/vendor/services/:id – delete one of the vendor's services. */
router.delete("/services/:id", async (req, res) => {
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

    if (!service) {
      return res.status(404).json({
        success: false,
        error: "Service not found.",
      });
    }

    if (String(service.vendorId) !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own services.",
      });
    }

    await servicesCollection().deleteOne({ _id: service._id });

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

/** GET /api/vendor/stats – numbers shown on the vendor dashboard. */
router.get("/stats", async (req, res) => {
  try {
    const vendorId = toObjectId(req.user.id);

    const [services, bookings] = await Promise.all([
      servicesCollection()
        .find({ vendorId }, { projection: { status: 1, isAvailable: 1 } })
        .toArray(),
      bookingsCollection()
        .find({ vendorId }, { projection: { status: 1 } })
        .toArray(),
    ]);

    const count = (status) => bookings.filter((b) => b.status === status).length;

    return res.status(200).json({
      success: true,
      totalServices: services.length,
      activeServices: services.filter(
        (s) => s.status === "approved" && s.isAvailable,
      ).length,
      pendingBookings: count("pending"),
      acceptedBookings: count("accepted"),
      currentPlan: isPremiumActive(req.user) ? "premium" : "free",
      planExpiresAt: req.user.subscriptionExpiresAt ?? null,
    });
  } catch (error) {
    logger.error(`Could not load vendor stats: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load your dashboard numbers. Please try again.",
    });
  }
});

/** GET /api/vendor/transactions – this vendor's subscription payments. */
router.get("/transactions", async (req, res) => {
  try {
    const transactions = await transactionsCollection()
      .find({ vendorId: toObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      transactions: transactions.map(toTransaction),
      total: transactions.length,
    });
  } catch (error) {
    logger.error(`Could not load vendor transactions: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load your transactions. Please try again.",
    });
  }
});

/** GET /api/vendor/bookings – booking requests for this vendor's services. */
router.get("/bookings", async (req, res) => {
  try {
    const filter = { vendorId: toObjectId(req.user.id) };
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
      bookings: await withBookingDetails(bookings, { includeCustomer: true }),
      total: bookings.length,
    });
  } catch (error) {
    logger.error(`Could not load vendor bookings: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load booking requests. Please try again.",
    });
  }
});

/** PATCH /api/vendor/bookings/:id/accept – accept a pending request. */
router.patch("/bookings/:id/accept", async (req, res) => {
  try {
    return await updateBookingStatus(req, res, "accepted");
  } catch (error) {
    logger.error(`Could not accept booking: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not accept this booking. Please try again.",
    });
  }
});

/** PATCH /api/vendor/bookings/:id/reject – reject a pending request. */
router.patch("/bookings/:id/reject", async (req, res) => {
  try {
    return await updateBookingStatus(req, res, "rejected");
  } catch (error) {
    logger.error(`Could not reject booking: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not reject this booking. Please try again.",
    });
  }
});

async function updateBookingStatus(req, res, status) {
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

  if (String(booking.vendorId) !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: "You can only manage bookings for your own services.",
    });
  }

  if (booking.status !== "pending") {
    return res.status(400).json({
      success: false,
      error: "Only pending bookings can be accepted or rejected.",
    });
  }

  const updated = await bookingsCollection().findOneAndUpdate(
    { _id: booking._id },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  const [withDetails] = await withBookingDetails([updated], {
    includeCustomer: true,
  });

  return res.status(200).json({
    success: true,
    message: status === "accepted" ? "Booking accepted." : "Booking rejected.",
    booking: withDetails,
  });
}

export default router;
