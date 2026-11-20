import { Router } from "express";

import { getDb } from "../config/db.js";
import { clientOrigin, env } from "../config/env.js";
import { stripe } from "../config/stripe.js";
import { authenticate, requireRole } from "../middlewares/auth.js";
import { logger } from "../utils/logger.js";
import { FREE_PLAN, PREMIUM_PLAN } from "../utils/plans.js";
import { toTransaction } from "../utils/transactions.js";
import { toObjectId } from "../utils/validation.js";

const router = Router();

const transactionsCollection = () => getDb().collection("transaction");
const usersCollection = () => getDb().collection("user");

const dayInMilliseconds = 24 * 60 * 60 * 1000;

/** GET /api/subscription/plans – the plans shown on the pricing page. */
router.get("/plans", (req, res) => {
  return res.status(200).json({
    success: true,
    plans: [FREE_PLAN, PREMIUM_PLAN],
  });
});

/* ------------------------------------------------------------------ *
 * Stripe webhook
 *
 * Stripe calls this URL directly (it is not a user request), so it is
 * registered before any authentication middleware. The signature check below
 * proves the request really came from Stripe.
 * ------------------------------------------------------------------ */

/** Activates premium for the vendor recorded in the session's transaction. */
async function activatePremium(session) {
  const transaction = await transactionsCollection().findOne({
    stripeSessionId: session.id,
  });

  if (!transaction) {
    logger.warning(`No transaction found for Stripe session ${session.id}`);
    return;
  }

  // Stripe retries webhooks, so ignore events we already processed.
  if (transaction.status === "succeeded") return;

  // Only activate when Stripe reports that money was actually collected.
  if (session.payment_status !== "paid") {
    logger.warning(
      `Session ${session.id} completed with payment_status=${session.payment_status}`,
    );
    return;
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PREMIUM_PLAN.durationDays * dayInMilliseconds,
  );

  await transactionsCollection().updateOne(
    { _id: transaction._id },
    {
      $set: {
        status: "succeeded",
        stripeSubscriptionId: session.subscription ?? "",
        updatedAt: now,
      },
    },
  );

  await usersCollection().updateOne(
    { _id: transaction.vendorId },
    {
      $set: {
        subscriptionPlan: "premium",
        subscriptionExpiresAt: expiresAt,
        updatedAt: now,
      },
    },
  );

  logger.success(`Premium activated for vendor ${transaction.vendorId}`);
}

/** Marks an abandoned or failed checkout session as failed. */
async function markPaymentFailed(session) {
  await transactionsCollection().updateOne(
    { stripeSessionId: session.id, status: { $ne: "succeeded" } },
    { $set: { status: "failed", updatedAt: new Date() } },
  );
}

router.post("/webhook", async (req, res) => {
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    logger.error("Stripe webhook received but Stripe is not configured.");

    return res.status(503).json({
      success: false,
      error: "Stripe webhook is not configured.",
    });
  }

  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).json({
      success: false,
      error: "Missing Stripe signature.",
    });
  }

  let event;

  try {
    // req.rawBody is saved by express.json() in app.js.
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    logger.warning(`Invalid Stripe signature: ${error.message}`);

    return res.status(400).json({
      success: false,
      error: "Invalid webhook signature.",
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await activatePremium(event.data.object);
        break;

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await markPaymentFailed(event.data.object);
        break;

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error(`Could not handle Stripe webhook: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Webhook handling failed.",
    });
  }
});

/* ------------------------------------------------------------------ *
 * Vendor checkout
 * ------------------------------------------------------------------ */

/**
 * POST /api/subscription/checkout – start a Premium purchase. (Vendor only)
 *
 * The vendor id comes from the token, so a vendor can only pay for their own
 * account. Premium is NOT activated here – that only happens in the webhook
 * after Stripe confirms the payment.
 */
router.post("/checkout", authenticate, requireRole("vendor"), async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      success: false,
      error: "Stripe is not configured. Add STRIPE_SECRET_KEY to the server .env file.",
    });
  }

  try {
    const now = new Date();

    const transaction = {
      vendorId: toObjectId(req.user.id),
      plan: "premium",
      amount: PREMIUM_PLAN.price,
      currency: env.STRIPE_CURRENCY,
      stripeSessionId: "",
      stripeSubscriptionId: "",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const { insertedId } = await transactionsCollection().insertOne(transaction);

    let session;

    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: req.user.email,
        client_reference_id: req.user.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: env.STRIPE_CURRENCY,
              unit_amount: PREMIUM_PLAN.price * 100, // Stripe expects the smallest unit
              product_data: {
                name: "WedPlan Premium",
                description: `${PREMIUM_PLAN.durationDays} days of premium access`,
              },
            },
          },
        ],
        metadata: {
          vendorId: req.user.id,
          plan: "premium",
          transactionId: insertedId.toString(),
        },
        success_url: `${clientOrigin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientOrigin}/payment/cancel?session_id={CHECKOUT_SESSION_ID}`,
      });
    } catch (error) {
      await transactionsCollection().updateOne(
        { _id: insertedId },
        { $set: { status: "failed", updatedAt: new Date() } },
      );

      logger.error(`Could not create Stripe checkout session: ${error.message}`);

      return res.status(500).json({
        success: false,
        error: "Could not start the checkout. Please try again.",
      });
    }

    await transactionsCollection().updateOne(
      { _id: insertedId },
      { $set: { stripeSessionId: session.id, updatedAt: new Date() } },
    );

    return res.status(201).json({
      success: true,
      message: "Checkout session created. Complete the payment in Stripe.",
      sessionId: session.id,
      url: session.url,
      transactionId: insertedId.toString(),
    });
  } catch (error) {
    logger.error(`Could not start checkout: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not start the checkout. Please try again.",
    });
  }
});

/**
 * GET /api/subscription/status?session_id=... – read-only payment status.
 *
 * The success page can use this to show the result of a checkout. It never
 * changes the plan, so opening the success URL alone cannot unlock Premium.
 */
router.get("/status", authenticate, async (req, res) => {
  try {
    const sessionId = req.query.session_id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: "session_id is required.",
      });
    }

    const transaction = await transactionsCollection().findOne({
      stripeSessionId: String(sessionId),
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction not found.",
      });
    }

    if (String(transaction.vendorId) !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "You do not have access to this transaction.",
      });
    }

    const vendor = await usersCollection().findOne({
      _id: transaction.vendorId,
    });

    return res.status(200).json({
      success: true,
      activated: transaction.status === "succeeded",
      plan: vendor?.subscriptionPlan ?? "free",
      subscriptionExpiresAt: vendor?.subscriptionExpiresAt ?? null,
      transaction: toTransaction(transaction),
    });
  } catch (error) {
    logger.error(`Could not load payment status: ${error.message}`);

    return res.status(500).json({
      success: false,
      error: "Could not load the payment status. Please try again.",
    });
  }
});

export default router;
