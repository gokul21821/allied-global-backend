import WebSocket from "ws";

export const elevenLabsCallService = {
  handleMediaStream(ws, req) {
    console.info("[Server] Twilio connected to media stream");

    let streamSid = null;
    let callSid = null;
    let elevenLabsWs = null;
    let agentId = null;

    // Handle WebSocket errors
    ws.on("error", console.error);

    // Set up ElevenLabs connection
    const setupElevenLabs = async (agentId) => {
      try {
        const wsUrl = `wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${agentId}`;
        elevenLabsWs = new WebSocket(wsUrl);

        elevenLabsWs.on("open", () => {
          console.log("[ElevenLabs] Connected to Conversational AI");
        });

        elevenLabsWs.on("message", (data) => {
          try {
            const message = JSON.parse(data);
            handleElevenLabsMessage(message);
          } catch (error) {
            console.error("[ElevenLabs] Error processing message:", error);
          }
        });

        elevenLabsWs.on("error", (error) => {
          console.error("[ElevenLabs] WebSocket error:", error);
        });

        elevenLabsWs.on("close", () => {
          console.log("[ElevenLabs] Disconnected");
        });
      } catch (error) {
        console.error("[ElevenLabs] Setup error:", error);
      }
    };

    const handleElevenLabsMessage = (message) => {
      switch (message.type) {
        case "conversation_initiation_metadata":
          console.log("[ElevenLabs] Received initiation metadata");
          break;

        case "audio":
          if (streamSid) {
            if (message.audio?.chunk) {
              const audioData = {
                event: "media",
                streamSid,
                media: {
                  payload: message.audio.chunk,
                },
              };
              ws.send(JSON.stringify(audioData));
            } else if (message.audio_event?.audio_base_64) {
              const audioData = {
                event: "media",
                streamSid,
                media: {
                  payload: message.audio_event.audio_base_64,
                },
              };
              ws.send(JSON.stringify(audioData));
            }
          }
          break;

        case "interruption":
          if (streamSid) {
            ws.send(
              JSON.stringify({
                event: "clear",
                streamSid,
              }),
            );
          }
          break;

        case "ping":
          if (message.ping_event?.event_id) {
            elevenLabsWs.send(
              JSON.stringify({
                type: "pong",
                event_id: message.ping_event.event_id,
              }),
            );
          }
          break;

        default:
          console.log(`[ElevenLabs] Unhandled message type: ${message.type}`);
      }
    };

    // Handle messages from Twilio
    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message);
        if (msg.event !== "media") {
          console.log(`[Twilio] Received event: ${msg.event}`);
        }

        switch (msg.event) {
          case "start":
            streamSid = msg.start.streamSid;
            callSid = msg.start.callSid;
            agentId = msg.start.customParameters?.agent_id;

            console.log(
              `[Twilio] Stream started - StreamSid: ${streamSid}, CallSid: ${callSid}, AgentId: ${agentId}`,
            );

            if (agentId) {
              setupElevenLabs(agentId);
            } else {
              console.error(
                "[Twilio] No agent_id provided in customParameters",
              );
            }
            break;

          case "media":
            if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              const audioMessage = {
                user_audio_chunk: Buffer.from(
                  msg.media.payload,
                  "base64",
                ).toString("base64"),
              };
              elevenLabsWs.send(JSON.stringify(audioMessage));
            }
            break;

          case "stop":
            console.log(`[Twilio] Stream ${streamSid} ended`);
            if (elevenLabsWs?.readyState === WebSocket.OPEN) {
              elevenLabsWs.close();
            }
            break;

          default:
            console.log(`[Twilio] Unhandled event: ${msg.event}`);
        }
      } catch (error) {
        console.error("[Twilio] Error processing message:", error);
      }
    });

    // Handle WebSocket closure
    ws.on("close", () => {
      console.log("[Twilio] Client disconnected");
      if (elevenLabsWs?.readyState === WebSocket.OPEN) {
        elevenLabsWs.close();
      }
    });
  },
};
