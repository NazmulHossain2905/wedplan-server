import { Router } from "express";

import { authenticate } from "../middlewares/auth.js";

const router = Router();

/**
 * GET /api/auth/me – returns the signed-in user.
 * Login, registration and sign-out stay in the Next.js app (Better Auth);
 * this endpoint only confirms that the backend can recognize the session.
 */
router.get("/me", authenticate, (req, res) => {
  res.status(200).json({ success: true, user: req.user });
});

export default router;
