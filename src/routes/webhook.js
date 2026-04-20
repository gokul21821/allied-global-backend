
import express from "express";
import { webhookController } from "../controllers/webhookController.js";

const router = express.Router();

// Stripe webhook endpoint (requires raw body)
router.post("/stripe", express.raw({ type: 'application/json' }), webhookController.handleStripeWebhook);

export default router;
