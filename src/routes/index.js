import { Router } from "express";

import authRoutes from "./auth.routes.js";
import profileRoutes from "./profile.routes.js";
import userRoutes from "./user.routes.js";

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

export default router;
