import { Router } from "express";

import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import bookingRoutes from "./booking.routes.js";
import profileRoutes from "./profile.routes.js";
import serviceRoutes from "./service.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import userRoutes from "./user.routes.js";
import vendorRoutes from "./vendor.routes.js";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Express server is running!",
  });
});

// Authentication check (session verification only – login stays in Better Auth)
router.use("/api/auth", authRoutes);

// Users (admin management + public details)
router.use("/api/users", userRoutes);

// The signed-in user's own profile
router.use("/api/profile", profileRoutes);

// Public services
router.use("/api/services", serviceRoutes);

// Customer bookings
router.use("/api/bookings", bookingRoutes);

// Subscription plans, Stripe checkout and webhook
router.use("/api/subscription", subscriptionRoutes);

// Vendor dashboard (services, and later bookings and subscription)
router.use("/api/vendor", vendorRoutes);

// Admin dashboard (services, and later users, bookings and transactions)
router.use("/api/admin", adminRoutes);

export default router;
