import cors from "cors";
import express from "express";
import morgan from "morgan";

import { allowedOrigins, env } from "./config/env.js";
import { ensureDb } from "./middlewares/ensure-db.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import routes from "./routes/index.js";

const app = express();

// Middlewares
app.use(
  express.json({
    // Stripe signs the exact bytes it sends, so keep a copy of the raw body
    // for the webhook route before the JSON parser turns it into an object.
    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Connect before any /api route reads MongoDB (works with any entry point).
// The root health check stays outside so it can report a DB failure.
app.use("/api", ensureDb);

// Routes
app.use("/", routes);

// 404 for unknown routes + JSON error responses
app.use(notFound);
app.use(errorHandler);

export default app;
