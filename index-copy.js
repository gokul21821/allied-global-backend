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

const secret = process.env.ELEVEN_LABS_WEBHOOK_SECRET;

// Webhook testing endpoint
// app.all("/webhook-testing", async (req, res) => {
//   // const headers = req.headers["elevenlabs-signature"].split(",");
//   // const timestamp = headers.find((e) => e.startsWith("t=")).substring(2);
//   // // const signature = headers.find((e) => e.startsWith("v0="));
//   // // Validate timestamp
//   // const reqTimestamp = timestamp * 1000;
//   // const tolerance = Date.now() - 30 * 60 * 1000;
//   // if (reqTimestamp < tolerance) {
//   //   console.log("request expired");
//   //   res.status(403).send("Request expired");
//   //   return;
//   // }
//   console.log("WEBHOOK TESTING HIT")
//   const postCallData = req.body.data;
//   const agentData = await elevenLabsService.getAgent(postCallData.agent_id);
//   const conversationId = postCallData.conversation_id;
//   const webhookUrl =
//     agentData?.platform_settings?.workspace_overrides
//       ?.conversation_initiation_client_data_webhook?.url;

//   if (webhookUrl) {
//     try {
//       // Fetch conversation audio from ElevenLabs API
//       let audioUrl = null;
//       if (conversationId) {
//         try {
//           const elevenLabsAudioUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}/audio`;
//           const audioResponse = await axios.get(elevenLabsAudioUrl, {
//             headers: {
//               "xi-api-key": process.env.ELEVEN_LABS_API_KEY,
//             },
//             responseType: "arraybuffer",
//           });

//           // Save audio to Firebase Storage
//           const fileName = `conversations/${conversationId}.wav`;
//           const file = bucket.file(fileName);

//           // Upload the original audio buffer to Firebase Storager
//           await file.save(Buffer.from(audioResponse.data), {
//             metadata: {
//               contentType: "audio/wav",
//             },
//           });

//           // Make file publicly accessible and get download URL
//           await file.makePublic();
//           audioUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

//           console.log(
//             `Successfully fetched and uploaded audio for conversation: ${conversationId}`,
//           );
//         } catch (audioError) {
//           console.error(
//             `Error fetching/uploading conversation audio: ${audioError.message}`,
//           );
//         }
//       }

//       const webhookPayload = {
//         conversationId,
//         agentId: postCallData.agent_id,
//         filename: `${conversationId}.wav`,
//         audioUrl,
//         data: postCallData,
//         timestamp: new Date().toISOString(),
//       };

//       const headers =
//         agentData?.platform_settings?.workspace_overrides
//           ?.conversation_initiation_client_data_webhook?.request_headers || {};
//       await axios.post(webhookUrl, webhookPayload, { headers });

//       console.log(`WEBHOOK PAYLOAD SENDING TO THE WEBHOOK URL ${webhookUrl}`, webhookPayload);
//       console.log(`Successfully sent data to webhook: ${webhookUrl}`);
//     } catch (error) {
//       console.error(`Error sending data to webhook: ${error.message}`);
//     }
//   } else {
//     console.log("Webhook URL is not available");
//   }

//   // Save conversation data to Firebase
//   try {
//     const agentId = postCallData.agent_id;
//     const convId = postCallData.conversation_id;
//     const callDurationSecs = postCallData.metadata?.call_duration_secs || 0;
//     const convTimestamp = postCallData.metadata.start_time_unix_secs;

//     if (!agentId || !convId) {
//       console.error("Missing agent_id or conversation_id in the request body.");
//       res.status(200).send();
//       return;
//     }

//     console.log(
//       `Saving conversation ${convId} for agent ${agentId} to Firebase`,
//     );

//     // Find the user who owns this agent
//     let userId = null;

//     // Query all users to find which one has this agent
//     const usersSnapshot = await db.collection("users").get();

//     for (const userDoc of usersSnapshot.docs) {
//       const userData = userDoc.data();
//       const userAgents = userData.agents || [];

//       const agentExists = userAgents.some(
//         (agent) => agent.agent_id === agentId,
//       );

//       if (agentExists) {
//         userId = userDoc.id;
//         break;
//       }
//     }

//     if (!userId) {
//       console.warn(`Agent ID '${agentId}' not found in any user's agents.`);
//       res.status(200).send();
//       return;
//     }

//     console.log(`Agent ID '${agentId}' belongs to User ID '${userId}'.`);

//     // Get user data to fetch callCostPerSecond
//     const userDoc = await db.collection("users").doc(userId).get();
//     const userData = userDoc.data();
//     const callCostPerSecond = userData?.callCostPerSecond || 0;

//     // Calculate convCost based on user's callCostPerSecond and call duration
//     let convCost;
//     if (callCostPerSecond && callCostPerSecond > 0) {
//       convCost = callCostPerSecond * callDurationSecs;
//     } else {
//       // Fallback to payload cost if callCostPerSecond is not available or 0
//       convCost = postCallData.metadata?.cost || 0;
//     }

//     console.log({ convCost, callCostPerSecond, callDurationSecs });

//     // Save conversation to conv_history collection
//     const convHistoryRef = db
//       .collection("users")
//       .doc(userId)
//       .collection("conv_history")
//       .doc(convId);

//     await convHistoryRef.set(postCallData);
//     console.log(
//       `Conversation ID '${convId}' has been saved to 'conv_history'.`,
//     );

//     // Update monthly invoice
//     const currentDate = new Date(convTimestamp * 1000);
//     const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;

//     const invoiceRef = db
//       .collection("users")
//       .doc(userId)
//       .collection("invoices")
//       .doc(monthKey);

//     await invoiceRef.set(
//       {
//         conv_ids: admin.firestore.FieldValue.arrayUnion(convId),
//         totalConvs: admin.firestore.FieldValue.increment(1),
//         totalCost: admin.firestore.FieldValue.increment(convCost),
//         invoiceStatus: "pending",
//         generated_at: admin.firestore.Timestamp.fromDate(new Date()),
//       },
//       { merge: true },
//     );
//     console.log("THE CONVERSATION COST", convCost);
//     console.log(
//       `Conversation ID '${convId}' has been added to the invoice for '${monthKey}'. Total cost updated.`,
//     );

//     // Log conversation completion
//     await auditService.logConversationAction(
//       userId,
//       "completed",
//       convId,
//       `Conversation ${convId} completed for agent ${agentId}. Duration: ${callDurationSecs}s, Cost: $${convCost}`,
//     );

//     const updatedInvoice = await invoiceRef.get();
//     const invoiceData = updatedInvoice.data();
//     const updatedTotalCost = invoiceData?.totalCost || 0;

//     const userRef = db.collection("users").doc(userId);
//     await userRef.set(
//       {
//         usage: updatedTotalCost,
//         lastCallAt: new Date().toISOString(),
//       },
//       { merge: true },
//     );
//   } catch (error) {
//     console.error(`Error saving conversation to Firebase: ${error.message}`);
//   }

//   res.status(200).send();
// });

app.all("/webhook-testing", async (req, res) => {
  try {
    // Safely access postCallData
    const postCallData = req.body?.data;
    if (!postCallData) {
      console.error("No postCallData received in request body");
      return res.status(400).send("Missing data");
    }

    // Example: fetch agent data
    const agentData = await elevenLabsService.getAgent(postCallData.agent_id);
    if (!agentData) {
      console.error("Agent not found");
      return res.status(404).send("Agent not found");
    }

    // You can log the body to see what the webhook sends
    console.log("Webhook body:", req.body);

    // Continue with your processing...
    res.status(200).send("Webhook received successfully");
  } catch (err) {
    console.error("Error in /webhook-testing:", err);
    res.status(500).send("Internal server error");
  }
});


app.use("/", dummyForwardTranscript);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
