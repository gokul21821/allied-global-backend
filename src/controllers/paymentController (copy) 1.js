import Stripe from "stripe";
import { db } from "../config/firebase.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const paymentController = {
  createCustomer: async (req, res) => {
    const { email } = req.body;
    try {
      if (!email) {
        return res.status(400).json({
          error: "Email is required",
          details: "Email is required to create a customer",
        });
      }
      const newCustomer = await stripe.customers.create({
        email: email,
      });
      res.status(200).json({
        customerId: newCustomer.id,
      });
    } catch (error) {
      console.error("Error getting/creating customer ID:", error);
      res.status(500).json({
        error: "Failed to get/create customer ID",
        details: error.message,
      });
    }
  },

  createPlanSubscriptionSession: async (req, res) => {
    const { productId, userId, email, customerId, return_url } = req.body;
    try {
      const product = await stripe.products.retrieve(productId);

      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 1,
      });

      if (prices.data.length === 0) {
        return res
          .status(400)
          .json({ error: "No active price found for this product" });
      }

      const price = prices.data[0];

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        customer: customerId,
        success_url: `${return_url}?setup_success=true`,
        cancel_url: `${return_url}?setup_canceled=true`,
        metadata: {
          userId: userId,
          email: email,
          productId: productId,
          productName: product.name,
        },
      });

      res.json({
        sessionUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      console.error("Checkout session creation error:", error);
      res.status(500).json({
        error: "Failed to create checkout session",
        details: error.message,
      });
    }
  },

  checkActiveSubscription: async (req, res) => {
    const { customerId } = req.query;
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      if (subscriptions.data.length === 0) {
        return res.json({
          hasSubscription: false,
          message: "No active subscription found",
        });
      }

      const activeSubscription = subscriptions.data[0];

      if (!activeSubscription) {
        return res.json({
          hasSubscription: true,
          message: "No active subscription found",
        });
      }

      const priceDetails = await stripe.prices.retrieve(
        activeSubscription.items.data[0].price.id,
      );

      const productDetails = await stripe.products.retrieve(
        priceDetails.product,
      );

      return res.json({
        hasSubscription: true,
        subscriptionDetails: {
          isActive: true,
          subscriptionId: activeSubscription.id,
          planName: productDetails.name,
          currentPeriodStart: activeSubscription.current_period_start,
          currentPeriodEnd: activeSubscription.current_period_end,
          amount: priceDetails.unit_amount / 100,
          interval: priceDetails.recurring.interval,
          productMetadata: productDetails.metadata,
        },
      });
    } catch (error) {
      console.error("Subscription check error:", error);
      return res.status(500).json({
        error: "Failed to check subscription",
        details: error.message,
      });
    }
  },

  setupSubscriptionPaymentMethod: async (req, res) => {
    const { userId, email, customerId, return_url } = req.body;
    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
      });

      const session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customerId,
        payment_method_types: ["card"],
        success_url: `${return_url}?setup_success=true&customer_id=${customerId}`,
        cancel_url: `${return_url}?setup_canceled=true`,

        metadata: {
          userId: userId,
          email: email,
          intent: "payment_method_setup",
        },
      });

      res.json({
        success: true,
        sessionUrl: session.url,
        sessionId: session.id,
        setupIntentClientSecret: setupIntent.client_secret,
      });
    } catch (error) {
      console.error("Payment method setup error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  checkPaymentMethodSetup: async (req, res) => {
    const { customerId } = req.query;
    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: "Customer ID is required",
      });
    }
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });
      const sessions = await stripe.checkout.sessions.list({
        customer: customerId,
        limit: 10,
      });

      const dynamicPaymentSessions = sessions.data.filter(
        (session) =>
          session.metadata?.intent === "payment_method_setup" &&
          session.status === "complete" &&
          session.mode === "setup",
      );

      const hasValidPaymentMethod = paymentMethods.data.length > 0;
      const hasDynamicPaymentSetup = dynamicPaymentSessions.length > 0;

      // console.log(hasValidPaymentMethod , hasDynamicPaymentSetup);

      let defaultPaymentMethod = null;
      if (hasValidPaymentMethod) {
        const customer = await stripe.customers.retrieve(customerId);
        defaultPaymentMethod =
          customer.invoice_settings?.default_payment_method || null;
      }

      res.json({
        success: true,
        hasValidPaymentMethod,
        hasDynamicPaymentSetup,
        defaultPaymentMethod,
        paymentMethods: paymentMethods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
          isDefault: pm.id === defaultPaymentMethod,
        })),
      });
    } catch (error) {
      console.error("Payment method check error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  getInvoices: async (req, res) => {
    try {
      const { customer_id } = req.params;

      const invoices = await stripe.invoices.list({
        customer: customer_id,
        limit: 10,
      });

      res.json({
        success: true,
        invoices: invoices.data,
      });
    } catch (error) {
      console.error("Invoice listing error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  createTopupSession: async (req, res) => {
    try {
      const { userId, email, customerId, amount, return_url } = req.body;

      if (!email || !customerId || !amount) {
        return res.status(400).json({ error: "Missing parameters" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Top-up Credit ($${amount})`,
              },
              unit_amount: amount * 100,
            },
            quantity: 1,
          },
        ],
        success_url: return_url,
        cancel_url: return_url,
        metadata: {
          userId,
          type: "topup",
        },
      });
      return res.json({ sessionUrl: session.url, sessionId: session.id });
    } catch (err) {
      console.error("Error creating top-up session:", err);
      return res.status(500).json({ error: "Failed to create top-up session" });
    }
  },

  chargePaymentMethod: async (req, res) => {
    try {
      const {
        userId,
        amount,
        currency = "usd",
        description = "Manual charge",
      } = req.body;

      if (!userId || !amount) {
        return res.status(400).json({
          error: "Missing required fields: userId and amount",
        });
      }

      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const customerId = userData.stripeCustomerId;
      const paymentMethodId = userData.defaultPaymentMethodId;

      if (!customerId || !paymentMethodId) {
        return res.status(400).json({
          error:
            "No payment method found for user. Please setup payment method first.",
        });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: currency,
        customer: customerId,
        payment_method: paymentMethodId,
        description: description,
        confirm: true,
        return_url: `${req.headers.origin}/return`,
        metadata: {
          userId: userId,
          paymentType: "manual-charge",
        },
      });

      const userRef = db.collection("users").doc(userId);
      const paymentData = {
        paymentId: paymentIntent.id,
        amount: amount,
        currency: currency,
        status: paymentIntent.status,
        paymentType: "manual-charge",
        description: description,
        createdAt: new Date().toISOString(),
      };

      await userRef.collection("payments").add(paymentData);

      res.json({
        paymentIntent: paymentIntent.id,
        status: paymentIntent.status,
        amount: amount,
        currency: currency,
      });
    } catch (error) {
      console.error("Error charging payment method:", error);
      res.status(500).json({
        error: "Failed to charge payment method",
        details: error.message,
      });
    }
  },

  //
  getUserBalanceAndUsage: async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    try {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const data = userSnap.data();

      res.json({
        success: true,
        balance: data.balance,
        usage: data.usage,
      });
    } catch (err) {
      console.error("Error fetching user balance and usage:", err);
      res.status(500).json({ error: "Failed to fetch balance and usage" });
    }
  },

  //Handle invoice payment
  invoicePayment: async (req, res) => {
    const { userId, monthKey } = req.body;

    if (!userId || !monthKey) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or monthKey",
      });
    }

    try {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const userData = userSnap.data();
      const customerId = userData.stripeCustomerId;

      if (!customerId) {
        return res
          .status(400)
          .json({ success: false, message: "Stripe customer ID not found" });
      }

      const invoiceRef = userRef.collection("invoices").doc(monthKey);
      const invoiceSnap = await invoiceRef.get();

      if (!invoiceSnap.exists) {
        return res
          .status(404)
          .json({ success: false, message: "Invoice not found" });
      }

      const invoiceData = invoiceSnap.data();

      if (invoiceData.invoiceStatus === "paid") {
        return res.status(200).json({
          success: false,
          message: "Invoice is already marked as paid",
        });
      }

      // If already created
      if (invoiceData.stripeInvoiceId && invoiceData.stripeUrl) {
        return res.status(200).json({
          success: true,
          message: "Invoice already exists",
          invoiceUrl: invoiceData.stripeUrl,
        });
      }

      const amountInCents = Math.round(invoiceData.totalCost * 100);

      const stripeInvoiceItem = await stripe.invoiceItems.create({
        customer: customerId,
        amount: amountInCents,
        currency: "usd",
        description: `Manual invoice for ${monthKey}`,
      });

      const stripeInvoice = await stripe.invoices.create({
        customer: customerId,
        auto_advance: true,
        collection_method: "send_invoice",
      });

      const stripeInvoiceId = stripeInvoice.id;
      const stripeUrl = stripeInvoice.hosted_invoice_url;

      // Update Firestore invoice document
      await invoiceRef.update({
        stripeInvoiceId,
        stripeUrl,
        invoiceStatus: "unpaid",
      });

      return res.status(200).json({
        success: true,
        message: "Stripe invoice created",
        invoiceUrl: stripeUrl,
      });
    } catch (error) {
      console.error("Error creating invoice:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        details: error.message,
      });
    }
  },

  // Clear a single unpaid invoice (Admin only)
  clearSingleInvoice: async (req, res) => {
    const { userId, invoiceId } = req.body;

    if (!userId || !invoiceId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId or invoiceId",
      });
    }

    try {
      const invoiceRef = db
        .collection("users")
        .doc(userId)
        .collection("invoices")
        .doc(invoiceId);
      const invoiceSnap = await invoiceRef.get();

      if (!invoiceSnap.exists) {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      const invoiceData = invoiceSnap.data();

      // Check if invoice is already paid or cleared
      if (invoiceData.invoiceStatus === "paid") {
        return res.status(400).json({
          success: false,
          message: "Cannot clear a paid invoice",
        });
      }

      if (invoiceData.invoiceStatus === "cleared") {
        return res.status(200).json({
          success: true,
          message: "Invoice is already cleared",
        });
      }

      // Update invoice status to cleared
      await invoiceRef.update({
        invoiceStatus: "cleared",
        clearedAt: new Date().toISOString(),
        clearedBy: req.body.adminId || "admin", // Track who cleared it
      });

      console.log(
        `Invoice ${invoiceId} cleared successfully for user ${userId} by ${req.body.adminId || "admin"}`,
      );

      return res.status(200).json({
        success: true,
        message: "Invoice cleared successfully",
        invoiceId: invoiceId,
      });
    } catch (error) {
      console.error("Error clearing invoice:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        details: error.message,
      });
    }
  },

  // Clear all unpaid invoices for a user (Admin only)
  clearAllInvoices: async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Missing userId",
      });
    }

    try {
      const invoicesRef = db
        .collection("users")
        .doc(userId)
        .collection("invoices");
      const invoicesSnap = await invoicesRef.get();

      if (invoicesSnap.empty) {
        return res.status(404).json({
          success: false,
          message: "No invoices found for this user",
        });
      }

      const batch = db.batch();
      let clearedCount = 0;
      const clearedInvoices = [];

      invoicesSnap.forEach((doc) => {
        const invoiceData = doc.data();

        // Only clear unpaid invoices
        if (
          invoiceData.invoiceStatus === "unpaid" ||
          !invoiceData.invoiceStatus
        ) {
          batch.update(doc.ref, {
            invoiceStatus: "cleared",
            clearedAt: new Date().toISOString(),
            clearedBy: req.body.adminId || "admin",
          });
          clearedCount++;
          clearedInvoices.push(doc.id);
        }
      });

      if (clearedCount === 0) {
        return res.status(200).json({
          success: true,
          message: "No unpaid invoices to clear",
          clearedCount: 0,
        });
      }

      // Commit the batch update
      await batch.commit();

      console.log(
        `Cleared ${clearedCount} invoice(s) for user ${userId} by ${req.body.adminId || "admin"}: ${clearedInvoices.join(", ")}`,
      );

      return res.status(200).json({
        success: true,
        message: `Successfully cleared ${clearedCount} invoice(s)`,
        clearedCount: clearedCount,
        clearedInvoices: clearedInvoices,
      });
    } catch (error) {
      console.error("Error clearing all invoices:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        details: error.message,
      });
    }
  },
};
