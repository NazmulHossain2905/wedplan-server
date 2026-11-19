import cors from "cors";
import express from "express";
import morgan from "morgan";

import { allowedOrigins, env } from "./config/env.js";
import routes from "./routes/index.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: allowedOrigins }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Routes
app.use("/", routes);

export default app;
