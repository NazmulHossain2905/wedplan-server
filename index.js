import app from "./src/app.js";
import { connectToMongoDB } from "./src/config/db.js";
import { env } from "./src/config/env.js";
import { logger } from "./src/utils/logger.js";

await connectToMongoDB();

app.listen(env.PORT, () => {
  logger.info(
    `Server is running on http://localhost:${env.PORT} (${env.NODE_ENV})`,
  );
});
