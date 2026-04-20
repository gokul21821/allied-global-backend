import { db } from '../config/firebase.js';
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function generateMonthlyInvoices() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const generatedAt = new Date();

  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const user = userDoc.data();

    const invoiceRef = db
      .collection("users")
      .doc(userId)
      .collection("invoices")
      .doc(monthKey);

    const invoiceSnap = await invoiceRef.get();

    if (!invoiceSnap.exists) {
      console.warn(
        `⚠️ Invoice document not found for user ${userId} for ${monthKey}, skipping.`,
      );
      continue;
    }

    const invoiceData = invoiceSnap.data();

    if (invoiceData.billed === true) {
      console.log(`⏭️ Invoice for ${userId} already processed, skipping.`);
      continue;
    }

    const monthlyTotal = invoiceData.totalCost / 100 || 0;
    const balance = user?.balance || 0;

    const remainingDue = Math.max(monthlyTotal - balance, 0);
    const newBalance = Math.max(balance - monthlyTotal, 0);//new balance is zero for new month 

    const stripeCustomerId = user?.stripeCustomerId;
    const invoiceStatus = remainingDue > 0 ? "unpaid" : "paid";

    let stripeInvoiceId = null;
    let stripeUrl = null;
    let paidAt = null;

    try {
      if (invoiceStatus === "unpaid" && stripeCustomerId && remainingDue > 0) {
        const invoiceItem = await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          amount: Math.round(remainingDue * 100), // charge only the unpaid part
          currency: "usd",
          description: `Outstanding usage for ${monthKey} after balance adjustment`,
        });

        const stripeInvoice = await stripe.invoices.create({
          customer: stripeCustomerId,
          auto_advance: true,
          collection_method: "send_invoice",
          metadata: {
            monthKey,
            userId,
          },
        });

        stripeInvoiceId = stripeInvoice.id;
        stripeUrl = stripeInvoice.hosted_invoice_url || null;
      } else {
        paidAt = generatedAt;
      }

      // ✅ Update invoice document with status + Stripe info
      await invoiceRef.update({
        invoiceStatus,
        remainingDue,
        stripeInvoiceId,
        stripeUrl,
        paidAt,
        billed: true,
        processedAt: generatedAt,
      });

      // ✅ Update user balance & reset usage
      await db.collection("users").doc(userId).update({
        balance: newBalance,
        usage: 0,
        lastBilledAt: generatedAt,
      });

      console.log(`✅ Invoice finalized for user ${userId}`);
    } catch (err) {
      console.error(`❌ Error processing user ${userId}: ${err.message}`);
    }
  }

  console.log(`🎉 Monthly invoice processing complete for ${monthKey}`);
}
