
import Stripe from "stripe";
import { db } from "../config/firebase.js";
import { auditService } from "../services/auditService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const webhookController = {
  handleStripeWebhook: async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }
};

async function handleInvoicePaid(invoice) {
  const userId = invoice.metadata?.userId;
  const monthKey = invoice.metadata?.monthKey;

  if (userId && monthKey) {
    const invoiceRef = db.collection("users").doc(userId).collection("invoices").doc(monthKey);
    await invoiceRef.update({
      invoiceStatus: "paid",
      paidAt: new Date().toISOString(),
      stripePaymentIntentId: invoice.payment_intent
    });

    await auditService.logPaymentAction(
      userId,
      "invoice_paid",
      invoice.id,
      `Invoice paid for ${monthKey} - $${(invoice.amount_paid / 100).toFixed(2)}`
    );
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const userId = invoice.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "invoice_payment_failed",
      invoice.id,
      `Invoice payment failed - $${(invoice.amount_due / 100).toFixed(2)}`
    );
  }
}

async function handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "subscription_created",
      subscription.id,
      `Subscription created - ${subscription.items.data[0]?.price?.id}`
    );
  }
}

async function handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "subscription_updated",
      subscription.id,
      `Subscription updated - Status: ${subscription.status}`
    );
  }
}

async function handleSubscriptionDeleted(subscription) {
  const userId = subscription.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "subscription_cancelled",
      subscription.id,
      `Subscription cancelled`
    );
  }
}

async function handlePaymentSucceeded(paymentIntent) {
  const userId = paymentIntent.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "payment_succeeded",
      paymentIntent.id,
      `Payment succeeded - $${(paymentIntent.amount / 100).toFixed(2)}`
    );
  }
}

async function handlePaymentFailed(paymentIntent) {
  const userId = paymentIntent.metadata?.userId;
  
  if (userId) {
    await auditService.logPaymentAction(
      userId,
      "payment_failed",
      paymentIntent.id,
      `Payment failed - $${(paymentIntent.amount / 100).toFixed(2)}`
    );
  }
}

async function handleCheckoutCompleted(session) {
  const userId = session.metadata?.userId;
  const type = session.metadata?.type;
  
  if (userId) {
    const action = type === 'topup' ? 'topup_completed' : 'checkout_completed';
    await auditService.logPaymentAction(
      userId,
      action,
      session.id,
      `Checkout session completed - $${(session.amount_total / 100).toFixed(2)}`
    );
  }
}
