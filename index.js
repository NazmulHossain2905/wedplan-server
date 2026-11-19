import "dotenv/config";

import app from "./src/app.js";
import { connectToMongoDB } from "./src/config/db.js";
import { logger } from "./src/utils/logger.js";

const PORT = process.env.PORT || 5000;

await connectToMongoDB();

app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`);
});
