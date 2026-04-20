import express from "express";
import expressWs from "express-ws";
import { callController } from "../controllers/callController.js";
import { elevenLabsCallService } from "../services/elevenLabsCall.js";

const router = express.Router();
expressWs(router);

router.post("/twilio-outbound", callController.twilioOutboundCall);
router.post("/sip-trunk-outbound", callController.sipTrunkOutboundCall);

// WebSocket endpoint for media streaming
router.ws("/media-stream", (ws, req) => {
  elevenLabsCallService.handleMediaStream(ws, req);
});

export default router;