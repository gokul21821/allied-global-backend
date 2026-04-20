import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import expressWs from "express-ws";
import agentRoutes from "./src/routes/agent.js";
import phoneNumberRoutes from "./src/routes/phoneNumber.js";
import voiceRoutes from "./src/routes/voice.js";
import conversationRoutes from "./src/routes/conversation.js";
import knowledgeBaseRoutes from "./src/routes/knowledgeBase.js";
import callRoutes from "./src/routes/call.js";
import toolRoutes from "./src/routes/tool.js";
import ghlRoutes from "./src/routes/ghl.js";
import calRoutes from "./src/routes/cal.js";
import secretRoutes from "./src/routes/secret.js";
import agentHelpersRoutes from "./src/routes/agentHelper.js"
import dashboardRoutes from "./src/routes/dashboard.js";
import dummyForwardTranscript from "./src/routes/ForwardTranscript.js";
import { elevenLabsCallService } from "./src/services/elevenLabsCall.js";
import bodyParser from "body-parser";
import { elevenLabsService } from "./src/services/elevenLabs.js";
import axios from "axios";
import batchCallRoutes from "./src/routes/batchCall.js";
import llmUsageRoutes from "./src/routes/llmUsage.js";
import paymentRoutes from "./src/routes/payment.js";
import userRoutes from "./src/routes/user.js";
import auditRoutes from "./src/routes/audit.js";
import { db, bucket } from "./src/config/firebase.js";
import admin from "firebase-admin";
import { auditService } from "./src/services/auditService.js";
import { WebhookDb } from "./src/config/webhookDb.js";


export const webhookDb = new WebhookDb();

dotenv.config();

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();

app.post(
  "/payment/stripe-webhook-invoice-success",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error("❌ Stripe webhook verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ✅ Handle top-up
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.metadata?.type === "topup") {
        const userId = session.metadata.userId;
        const amount = session.amount_total / 100;

        try {
          const userRef = db.collection("users").doc(userId);
          const userDoc = await userRef.get();
          const currentBalance = userDoc.exists
            ? userDoc.data().balance || 0
            : 0;

          await userRef.set(
            {
              balance: currentBalance + amount,
              hasToppedUp: true,
              lastTopUpAt: new Date().toISOString(),
            },
            { merge: true },
          );

          console.log(`✅ Top-up: $${amount} added to user ${userId}`);
        } catch (err) {
          console.error("🔥 Error updating balance:", err.message);
        }
      }
    }

    // ✅ Handle successful invoice payment
    else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      const amountPaid = invoice.amount_paid / 100;
      const monthKey = invoice.metadata.monthKey;

      try {
        const usersRef = db.collection("users");
        const snapshot = await usersRef
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();
        if (snapshot.empty) {
          console.warn(`User not found for customer ${customerId}`);
          return res.status(404).send("User not found");
        }

        const userDoc = snapshot.docs[0];
        const userId = userDoc.id;

        await db
          .collection("users")
          .doc(userId)
          .collection("invoices")
          .doc(monthKey)
          .update({
            invoiceStatus: "paid",
            paidAt: admin.firestore.Timestamp.now(),
            stripeInvoiceId: invoice.id,
            stripeUrl: invoice.hosted_invoice_url,
          });
        console.log(`✅ Invoice payment recorded for user ${userId}`);

        await usersRef.doc(userId).collection("payments").add({
          paymentId: invoice.id,
          amount: amountPaid,
          status: "paid",
          invoiceUrl: invoice.hosted_invoice_url,
          createdAt: new Date().toISOString(),
        });

        console.log(`✅ Invoice payment recorded for user ${userId}`);
      } catch (err) {
        console.error("🔥 Error recording invoice:", err.message);
      }
    }

    res.status(200).send("Webhook received");
  },
);

expressWs(app);

// Enable CORS for all routes
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Content-Length", "X-Foo", "X-Bar"],
    preflightContinue: false,
    optionsSuccessStatus: 200,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
  bodyParser.raw({
    type: function (req) {
      // Exclude multipart form data from raw parsing
      return (
        req.get("Content-Type") &&
        !req.get("Content-Type").startsWith("multipart/")
      );
    },
    limit: "50mb",
  }),
);

// Removed global audit middleware - using specific audit logging instead

// Handle preflight requests
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// Root route for health check
app.get("/", (_, res) => {
  res.json({ message: "Server is running" });
});

// Route to handle incoming calls from Twilio
// Route to handle incoming calls from Twilio
app.all("/incoming-call-eleven", async (req, res) => {
  try {
    const { To } = req.body || req.query; // Twilio passes 'To' parameter

    if (!To) {
      console.error("[Inbound Call] Missing 'To' parameter");
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>System error: Missing phone number information.</Say>
        </Response>`;
      return res.type("text/xml").send(twimlResponse);
    }

    // Find the user who has this phone number assigned
    console.log(`[Inbound Call] lookup for number: ${To}`);

    const usersSnapshot = await db.collection("users").get();
    let foundAgentId = null;
    let foundAgentName = null;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const phoneNumbers = userData.phoneNumbers || [];

      const matchedNumber = phoneNumbers.find((pn) => pn.phone_number === To);

      if (matchedNumber && matchedNumber.agent_id) {
        foundAgentId = matchedNumber.agent_id;

        // Optionally find agent name for logging
        const agent = userData.agents?.find((a) => a.agent_id === foundAgentId);
        foundAgentName = agent?.name || "Unknown Agent";

        console.log(
          `[Inbound Call] Found agent ${foundAgentName} (${foundAgentId}) for number ${To}`,
        );
        break;
      }
    }

    if (!foundAgentId) {
      console.warn(`[Inbound Call] No agent assigned for number ${To}`);
      const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say>Please assign an agent to this phone number in your dashboard.</Say>
        </Response>`;
      return res.type("text/xml").send(twimlResponse);
    }

    // Generate TwiML with the found agent_id
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="wss://${req.headers.host}/media-stream">
            <Parameter name="agent_id" value="${foundAgentId}" />
          </Stream>
        </Connect>
      </Response>`;

    res.type("text/xml").send(twimlResponse);
  } catch (error) {
    console.error("[Inbound Call] Error handling incoming call:", error);
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>System error occurred.</Say>
      </Response>`;
    res.type("text/xml").send(twimlResponse);
  }
});

// WebSocket route for handling media streams
app.ws("/media-stream", (ws, req) => {
  elevenLabsCallService.handleMediaStream(ws, req);
});

// Routes
app.use("/agents", agentRoutes);
app.use("/phone-numbers", phoneNumberRoutes);
app.use("/voices", voiceRoutes);
app.use("/", conversationRoutes);
app.use("/knowledge-base", knowledgeBaseRoutes);
app.use("/call", callRoutes);
app.use("/tools", toolRoutes);
app.use("/ghl", ghlRoutes);
app.use("/calcom", calRoutes);
app.use("/secrets", secretRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/batch-call", batchCallRoutes);
app.use("/llm-usage", llmUsageRoutes);
app.use("/payment", paymentRoutes);
app.use("/users", userRoutes);
app.use("/audit", auditRoutes);

app.use("/agent-helpers",agentHelpersRoutes)

app.get("/received-webhooks/search", (req, res) => {
  const { conversation_id, agent_id } = req.query;

  // use the class method, not raw .all()
  webhookDb.getWebhooks({ conversation_id, agent_id }, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      count: rows.length,
      filters: {
        conversation_id: conversation_id || null,
        agent_id: agent_id || null,
      },
      data: rows,
    });
  });
});
app.get("/sent-webhooks/search", (req, res) => {
  const conversation_id = req.query.conversation_id || null;
  const sent_url = req.query.sent_url || null;

  // use the class method for sent_webhooks
  webhookDb.getSentWebhooks({ conversation_id, sent_url }, (err, rows) => {
    if (err) {
      console.error("Failed to fetch sent webhooks:", err);
      return res.status(500).json({ error: err.message });
    }

    res.json({
      count: rows.length,
      filters: {
        conversation_id,
        sent_url,
      },
      data: rows,
    });
  });
});

const secret = process.env.ELEVEN_LABS_WEBHOOK_SECRET;

// Webhook testing endpoint
app.all("/webhook-testing", async (req, res) => {
  console.log("Webhook testing endpoint hit", Date.now());
  const headers = req.headers["elevenlabs-signature"].split(",");
  const timestamp = headers.find((e) => e.startsWith("t=")).substring(2);
  const signature = headers.find((e) => e.startsWith("v0="));
  // Validate timestamp
  const reqTimestamp = timestamp * 1000;
  const tolerance = Date.now() - 30 * 60 * 1000;
  if (reqTimestamp < tolerance) {
    console.log("request expired");
    res.status(403).send("Request expired");
    return;
  }

  const postCallData = req.body.data;
  console.log("POST CALL DATA", postCallData?.agent_id);
  const agentData = await elevenLabsService.getAgent(postCallData.agent_id);
  const conversationId = postCallData.conversation_id;
  const webhookUrl =
    agentData?.platform_settings?.workspace_overrides
      ?.conversation_initiation_client_data_webhook?.url;
  webhookDb.saveWebhook({
    path: req.originalUrl,
    conversation_id: postCallData?.conversation_id,
    agent_id: postCallData?.agent_id,
    headers: req.headers,
    body: postCallData,
  });
  console.log("Webhook log scheduled to save ✅", conversationId);

  if (webhookUrl) {
    try {
      const agentId = postCallData.agent_id ;
      const  elevenLabsAudioUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`

      let audioUrl = null;

      if (conversationId) {

        console.log("Fetching audio for conversation", conversationId);
        try {

          const audioResponse = await axios.get(elevenLabsAudioUrl, {
            headers: { "xi-api-key": process.env.ELEVEN_LABS_API_KEY },
            responseType: "arraybuffer",
          });

          const fileName = `conversations/${conversationId}.wav`;
          const file = bucket.file(fileName);

          await file.save(Buffer.from(audioResponse.data), {
            metadata: { contentType: "audio/wav" },
          });

          await file.makePublic();
          audioUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

          console.log(`Uploaded audio for conversation ${conversationId}`);
        } catch (audioError) {
          console.error("Audio fetch/upload failed:", audioError.message);
        }
      }

      const webhookPayload = {
        conversationId,
        agentId,
        filename: conversationId ? `${conversationId}.wav` : null,
        audioUrl:audioUrl || elevenLabsAudioUrl,
        data: postCallData,
        timestamp: new Date().toISOString(),
      };

      console.log("Webhook payload", webhookPayload)

      const webhookHeaders =
        agentData?.platform_settings?.workspace_overrides
          ?.conversation_initiation_client_data_webhook?.request_headers || {};

      const response = await axios.post(webhookUrl, webhookPayload, {
        headers: webhookHeaders,
      });

      if (response.status >= 200 && response.status < 300) {
        
        webhookDb.saveSentWebhookSimple({
          sent_url: webhookUrl,
          sent_payload: webhookPayload,
          conversation_id: conversationId,
        });
        console.log(
          "Webhook sent successfully ✅",
          "about ",
          conversationId,
          "to",
          webhookUrl,
        );
      }
    } catch (error) {
      console.error("Error sending data to webhook:", error.message);
    }
  } else {
    console.log("Webhook URL is not available");
  }

  // Save conversation data to Firebase
  try {
    const agentId = postCallData.agent_id;
    const convId = postCallData.conversation_id;
    const callDurationSecs = postCallData.metadata?.call_duration_secs || 0;
    const convTimestamp = postCallData.metadata.start_time_unix_secs;

    if (!agentId || !convId) {
      console.error("Missing agent_id or conversation_id in the request body.");
      res.status(200).send();
      return;
    }

    console.log(
      `Saving conversation ${convId} for agent ${agentId} to Firebase`,
    );

    // Find the user who owns this agent
    let userId = null;

    // Query all users to find which one has this agent
    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userAgents = userData.agents || [];

      const agentExists = userAgents.some(
        (agent) => agent.agent_id === agentId,
      );

      if (agentExists) {
        userId = userDoc.id;
        break;
      }
    }

    if (!userId) {
      console.warn(`Agent ID '${agentId}' not found in any user's agents.`);
      res.status(200).send();
      return;
    }

    console.log(`Agent ID '${agentId}' belongs to User ID '${userId}'.`);

    // Get user data to fetch callCostPerSecond
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();
    const callCostPerSecond = userData?.callCostPerSecond || 0;

    // Calculate convCost based on user's callCostPerSecond and call duration
    let convCost;
    if (callCostPerSecond && callCostPerSecond > 0) {
      convCost = callCostPerSecond * callDurationSecs;
    } else {
      // Fallback to payload cost if callCostPerSecond is not available or 0
      convCost = postCallData.metadata?.cost || 0;
    }

    console.log({ convCost, callCostPerSecond, callDurationSecs });

    // Save conversation to conv_history collection
    const convHistoryRef = db
      .collection("users")
      .doc(userId)
      .collection("conv_history")
      .doc(convId);

    await convHistoryRef.set(postCallData);
    console.log(
      `Conversation ID '${convId}' has been saved to 'conv_history'.`,
    );

    // Update monthly invoice
    const currentDate = new Date(convTimestamp * 1000);
    const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

    const invoiceRef = db
      .collection("users")
      .doc(userId)
      .collection("invoices")
      .doc(monthKey);

    await invoiceRef.set(
      {
        conv_ids: admin.firestore.FieldValue.arrayUnion(convId),
        totalConvs: admin.firestore.FieldValue.increment(1),
        totalCost: admin.firestore.FieldValue.increment(convCost),
        invoiceStatus: "pending",
        generated_at: admin.firestore.Timestamp.fromDate(new Date()),
      },
      { merge: true },
    );
    console.log("THE CONVERSATION COST", convCost);
    console.log(
      `Conversation ID '${convId}' has been added to the invoice for '${monthKey}'. Total cost updated.`,
    );

    // Log conversation completion
    await auditService.logConversationAction(
      userId,
      "completed",
      convId,
      `Conversation ${convId} completed for agent ${agentId}. Duration: ${callDurationSecs}s, Cost: $${convCost}`,
    );

    const updatedInvoice = await invoiceRef.get();
    const invoiceData = updatedInvoice.data();
    const updatedTotalCost = invoiceData?.totalCost || 0;

    const userRef = db.collection("users").doc(userId);
    await userRef.set(
      {
        usage: updatedTotalCost,
        lastCallAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error(`Error saving conversation to Firebase: ${error.message}`);
  }

  res.status(200).send();
});

app.use("/", dummyForwardTranscript);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
