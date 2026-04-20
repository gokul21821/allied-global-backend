import { outboundCallSchema } from "../validators/call.js";
import { elevenLabsOutboundService } from "../services/elevenLabsOutbound.js";

export const callController = {
  async twilioOutboundCall(req, res) {
    try {
      const { error, value } = outboundCallSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { agentId, to_number, agent_phone_number_id, conversation_initiation_client_data } = value;

      try {
        const response = await elevenLabsOutboundService.twilioOutboundCall(
          agentId,
          to_number,
          agent_phone_number_id,
          conversation_initiation_client_data
        );

        console.log("[ElevenLabs] Outbound call initiated");
        if (response.status === 200) {
          return res.status(200).json(response);
        }
        return res.json(response);
      } catch (error) {
        console.error("[ElevenLabs] Error initiating call:", error);
        res.status(500).json({ error: "Failed to initiate call" });
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      res.status(500).json({ error: "Failed to initiate call" });
    }
  },

  async sipTrunkOutboundCall(req, res) {
    try {
      const { error, value } = outboundCallSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { agentId, to_number, agent_phone_number_id, conversation_initiation_client_data } = value;

      try {
        const response = await elevenLabsOutboundService.sipTrunkOutboundCall(
          agentId,
          to_number,
          agent_phone_number_id,
          conversation_initiation_client_data
        );

        console.log("[ElevenLabs] Outbound call initiated");
        res.json(response);
      } catch (error) {
        console.error("[ElevenLabs] Error initiating call:", error);
        res.status(500).json({ error: "Failed to initiate call" });
      }
    } catch (error) {
      console.error("Error initiating call:", error);
      res.status(500).json({ error: "Failed to initiate call" });
    }
  },
};
