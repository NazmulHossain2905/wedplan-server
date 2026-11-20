import { Router } from "express";

import authRoutes from "./auth.routes.js";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Express server is running!",
  });
});

// Authentication check (session verification only – login stays in Better Auth)
router.use("/api/auth", authRoutes);

export default router;
