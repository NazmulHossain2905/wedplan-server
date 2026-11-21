# WedPlan — Wedding Planning Platform (Server)

Express 5 REST API for WedPlan. It stores services, bookings and subscription transactions in MongoDB, and verifies JWTs issued by the Next.js/Better Auth app against its JWKS endpoint. Login and registration stay in Better Auth; this server only authorizes and manages business data.

## Important Features

- JWT (JWKS) middleware with role checks (admin/vendor/customer) and blocked-account rejection
- Public service catalogue with search, filters, sorting and location list
- Vendor service CRUD, approval status, availability and free-plan limits
- Booking requests with ownership checks, duplicate prevention and accept/reject/cancel
- Admin stats, user blocking, service moderation, booking overview and read-only transactions
- Stripe Checkout for a 30-day Premium pass; activation happens only in the verified webhook
- Environment-driven configuration and consistent `{ success, ... }` / `{ success: false, error }` responses

## Technology Stack

Node.js (ESM), Express 5, MongoDB driver 7 (no ORM), `jose` for JWT/JWKS verification, Stripe SDK, cors, morgan, dotenv, chalk.

## Installation

```bash
git clone https://github.com/NazmulHossain2905/wedplan-server.git
cd wedplan-server
npm install
cp .env.example .env   # Windows: Copy-Item .env.example .env
```

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

Never commit `.env` or any secret key.

## Run Locally

```bash
npm run dev     # node --watch
npm start       # production-style start
```

The API listens on `http://localhost:5000`. For local Stripe webhooks:

```bash
stripe listen --all-snapshot --forward-to localhost:5000/api/subscription/webhook
```

Put the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` and restart the server.

## Main Routes

| Base | What it covers |
| --- | --- |
| `/api/auth/me` | Current user from the verified JWT |
| `/api/users`, `/api/profile` | Admin user management and self-profile updates |
| `/api/services`, `/api/vendors` | Public catalogue and featured vendors |
| `/api/bookings`, `/api/customer/stats` | Customer bookings and dashboard stats |
| `/api/vendor` | Vendor services, bookings, stats and billing history |
| `/api/admin` | Dashboard stats, users, services, bookings and transactions |
| `/api/subscription` | Plans, checkout, Stripe webhook and read-only status |

## Links

- Live website: _to be added after deployment_
- Client repository: https://github.com/NazmulHossain2905/wedplan-client
- Server repository: https://github.com/NazmulHossain2905/wedplan-server
