import cors from "cors";
import express from "express";
import morgan from "morgan";

import { allowedOrigins, env } from "./config/env.js";
import { errorHandler, notFound } from "./middlewares/error.js";
import routes from "./routes/index.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Routes
app.use("/", routes);

// 404 for unknown routes + JSON error responses
app.use(notFound);
app.use(errorHandler);

export default app;
