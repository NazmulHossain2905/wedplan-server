# WedPlan

## Environment variables

All configuration is read once in `src/config/env.js` and imported as `env`:

```js
import { env } from "./src/config/env.js";

env.PORT; // 5000
```

Copy `.env.example` to `.env` and fill in the values.

| Variable      | Required | Default                 | Used in                       |
| ------------- | -------- | ----------------------- | ----------------------------- |
| `NODE_ENV`    | no       | `development`           | `src/app.js` (morgan format)  |
| `PORT`        | no       | `5000`                  | `index.js`                    |
| `MONGODB_URI` | yes      | –                       | `src/config/db.js`            |
| `DB_NAME`     | no       | `wedplan`               | `src/config/db.js`            |
| `CLIENT_URL`  | no       | `http://localhost:3000` | `src/app.js` (CORS origin)    |

`CLIENT_URL` accepts a comma-separated list of origins.

## Project structure

```
index.js                # entry point: connect DB, start server
src/
  app.js                # express app + middlewares
  config/
    env.js              # environment variables
    db.js               # MongoDB connection
  routes/
    index.js            # route definitions
  utils/
    logger.js
```
