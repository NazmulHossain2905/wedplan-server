# WedPlan — Wedding Planning Platform (Server)

## Project Overview

Express 5 REST API for WedPlan. It stores services, bookings and subscription transactions in MongoDB and verifies JWTs issued by the Next.js/Better Auth app against its JWKS endpoint. Login and registration stay in Better Auth; this server only authorizes and manages business data.

## Important Features

- JWT (JWKS) middleware with role checks (admin/vendor/customer) and blocked-account rejection
- Public service catalogue with search, filters, sorting and location list
- Vendor service CRUD, approval status, availability and free-plan limits
- Free plan: pending and approved services count toward the 3-service limit; rejected and archived services do not. Premium vendors are unlimited, and toggling availability never changes plan usage.
- Booking requests with ownership checks, duplicate prevention and accept/reject/cancel
- Admin stats, user blocking, service moderation, booking overview and read-only transactions
- Stripe Checkout for a 30-day Premium pass; activation happens only in the verified webhook
- Environment-driven configuration and consistent `{ success, ... }` / `{ success: false, error }` responses

## Technology Stack

Node.js (ESM), Express 5, MongoDB driver 7 (no ORM), `jose` for JWT/JWKS verification, Stripe SDK, cors, morgan, dotenv, chalk.

## Getting Started

Prerequisites:

- Node.js 20+ and npm
- A MongoDB database shared with the client
- The `wedplan-client` app running so this API can fetch `/api/auth/jwks` and verify tokens

### How to Run the Project Locally

Clone the repo, install dependencies, create `.env` from `.env.example`, point `BETTER_AUTH_URL` at the client, then run `npm start`. The API listens on `http://localhost:5000`.

## Installation

```bash
git clone https://github.com/NazmulHossain2905/wedplan-server.git
cd wedplan-server
npm install
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

Never commit `.env` or any secret key.

## Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `MONGODB_URI` | yes | — | MongoDB connection string |
| `DB_NAME` | no | `wedplan` | Database name |
| `PORT` | no | `5000` | API port |
| `CLIENT_URL` | no | `http://localhost:3000` | Allowed CORS origins (comma-separated) |
| `BETTER_AUTH_URL` | no | first `CLIENT_URL` | Base URL used to fetch `/api/auth/jwks` |
| `STRIPE_SECRET_KEY` | no | empty | Enables checkout; without it payment routes return 503 |
| `STRIPE_WEBHOOK_SECRET` | no | empty | Verifies webhook signatures |
| `STRIPE_CURRENCY` | no | `bdt` | Checkout currency |
| `PREMIUM_PRICE` | no | `4999` | Premium price in whole currency units |
| `PREMIUM_DURATION_DAYS` | no | `30` | Length of a Premium pass |

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start with `node --watch` for local development |
| `npm start` | Production-style start (`node index.js`) |
| `npm run seed:services` | Ensure at least 6 approved + active services exist |

## Project Structure

```
index.js                    # Connect to MongoDB, then start Express
src/
├── app.js                  # JSON/body parsing, CORS, logging, DB guard, routes, error handlers
├── config/
│   ├── db.js               # MongoDB connection helper
│   ├── env.js              # Environment parsing and allowed CORS origins
│   └── stripe.js           # Stripe client
├── middlewares/
│   ├── auth.js             # authenticate (JWT/JWKS) and requireRole
│   ├── ensure-db.js        # Database availability guard for /api
│   └── error.js            # 404 and JSON error handler
├── routes/                 # One router per resource area (see API Endpoints)
└── utils/                  # Validation, DTOs, plans, subscription, bookings, logger
scripts/
└── seed-services.js        # Seed public catalogue entries
```

## API Endpoints

All routes are mounted under `/api` unless noted.

| Base | What it covers |
| --- | --- |
| `GET /` | Health check including database status (not under `/api`) |
| `/api/auth` | `GET /me` — current user from the verified JWT |
| `/api/users` | Admin user list, public user details, `PATCH /:id/block`, `/unblock`, `/role` |
| `/api/profile` | `GET`/`PATCH /` — the signed-in user's own profile |
| `/api/services` | `GET /` catalogue with search/filter/sort, `GET /:id` details |
| `/api/vendors` | `GET /` featured vendors |
| `/api/bookings` | `POST /` create, `GET /` list, `GET /:id`, `PATCH /:id/cancel`, `PATCH /:id/respond` |
| `/api/customer` | `GET /stats` customer dashboard numbers |
| `/api/vendor` | `GET`/`POST`/`PATCH`/`DELETE /services`, `GET /stats`, `/transactions`, `/bookings`, `PATCH /bookings/:id/accept`, `/reject` |
| `/api/admin` | `GET /services`, `GET /stats`, `GET /users`, `GET /bookings`, `GET /transactions`, `PATCH /services/:id/status`, `/services/:id/availability`, `/users/:id/status` |
| `/api/subscription` | `GET /plans`, `POST /checkout`, `POST /webhook`, `GET /status` |

## Authentication & Authorization

- The client signs in with Better Auth and obtains a short-lived JWT. Every protected request must send `Authorization: Bearer <token>`.
- `authenticate` verifies the signature with `createRemoteJWKSet(new URL("/api/auth/jwks", BETTER_AUTH_URL))`, loads the user from MongoDB on every request, and attaches `req.user` with current role, blocked status and subscription plan. Role and blocked status are never trusted from the token or request body.
- `requireRole(...roles)` restricts a route to specific roles and must be used after `authenticate`.
- Responses: `401` for missing/invalid/expired tokens or unknown accounts, `403` for blocked accounts or wrong roles, `404` for unknown routes.
- The Stripe webhook is unauthenticated by JWT; it verifies the `Stripe-Signature` header instead.

## Request Validation

Shared helpers live in `src/utils/validation.js`:

- `isValidObjectId` / `toObjectId` — validate and convert MongoDB IDs.
- `getMissingFields` — reports required fields that are missing or blank.
- `isValidUrl` — accepts only `http(s)` image URLs (images are uploaded to ImgBB by the client first).
- `escapeRegex` — escapes user input before using it in a MongoDB regex search.

Routes additionally validate allowed values (service categories, review statuses, boolean availability), price greater than zero, at least one image URL, protected fields that vendors may not update, the free-plan quota, booking ownership and duplicate/state rules.

## Error Handling

- All API responses use `{ success: true, ... }` or `{ success: false, error: "..." }`.
- `notFound` returns `404` for unmatched routes; `errorHandler` returns `400` for invalid JSON and `500` for unexpected errors, always as JSON rather than an HTML error page.
- Expected validation failures return `400`, auth/authorization failures `401`/`403`, missing resources `404`, and plan-limit rejections `403`.
- The raw request body is preserved (`req.rawBody`) so Stripe can verify webhook signatures after JSON parsing.

## Database Structure

Business collections use conventional singular names: `service`, `booking` and `transaction` (the assignment refers to them as `Services`, `Bookings` and `Transactions`; no duplicate collections are created). Better Auth owns `user`, `session`, `account` and `verification` in the same database.

- `service` — vendorId, serviceName, category, description, price, location, images, status (`pending`/`approved`/`rejected`), isAvailable, timestamps. Free-plan usage counts `pending` + `approved` only.
- `booking` — serviceId, vendorId, customerId, eventDate, eventLocation, message, status, createdAt.
- `transaction` — vendorId, plan, amount, currency, stripeSessionId, paymentStatus, createdAt. Written by the verified Stripe webhook.
- `user` — includes role, isBlocked, subscriptionPlan and subscriptionExpiresAt, maintained by Better Auth and admin actions.

## Deployment

Deploy the client and this API separately (Vercel is used for the hosted instance). Set every variable from the Environment Variables table in the hosting platform; in particular `BETTER_AUTH_URL` must point to the deployed client so JWKS verification works, and `CLIENT_URL` must include the client origin for CORS. Configure the Stripe webhook to `https://<api-host>/api/subscription/webhook`, set `STRIPE_WEBHOOK_SECRET` from the signing secret, and restart. Use `npm start` as the start command; `GET /` is the health check.

## Live Website Link

https://wedplan-bd.vercel.app/

## Related Repository

- Client repository (Next.js frontend): https://github.com/NazmulHossain2905/wedplan-client
- Server repository (this API): https://github.com/NazmulHossain2905/wedplan-server

## 📄 License

Distributed under the [MIT License](https://opensource.org/licenses/MIT). See the repository's license file for details.

---

<div align="center">
  <sub>Built with ❤️ for couples planning their big day — <em>WedPlan, where every love story begins.</em></sub>
</div>
