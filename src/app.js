import cors from "cors";
import express from "express";
import morgan from "morgan";

import routes from "./routes/index.js";

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan("dev"));

// Routes
app.use("/", routes);

export default app;
