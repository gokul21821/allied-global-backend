import express from "express";
import { paymentController } from "../controllers/paymentController.js";

const router = express.Router();

// Customer management
router.post("/create-customer", paymentController.createCustomer);

// Subscription management
router.post(
  "/create-plan-subscription-session",
  paymentController.createPlanSubscriptionSession,
);
router.get(
  "/check-active-subscription",
  paymentController.checkActiveSubscription,
);

// Payment method setup and management
router.post(
  "/setup-subscription-payment-method",
  paymentController.setupSubscriptionPaymentMethod,
);
router.get(
  "/check-payment-method-setup",
  paymentController.checkPaymentMethodSetup,
);

// Invoice management
router.get("/invoices/:customer_id", paymentController.getInvoices);

// Manual charge
router.post("/charge-payment-method", paymentController.chargePaymentMethod);

router.post("/create-topup-session", paymentController.createTopupSession);

router.get("/user-balance-usage", paymentController.getUserBalanceAndUsage);

router.get("/invoice-payment", paymentController.invoicePayment);

// Clear invoices (Admin only)
router.post("/clear-invoice", paymentController.clearSingleInvoice);
router.post("/clear-all-invoices", paymentController.clearAllInvoices);

export default router;
