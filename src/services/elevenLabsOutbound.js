
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsOutboundService = {
  async twilioOutboundCall(agentId, toNumber, agentPhoneNumberId, conversationInitiationClientData = null) {
    try {
      const requestBody = {
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber
      };

      // Add conversation_initiation_client_data (dynamic_variables) if provided
      if (conversationInitiationClientData) {
        requestBody.conversation_initiation_client_data = conversationInitiationClientData;
      }

      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}/convai/twilio/outbound-call`,
        requestBody,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json"
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to initiate outbound call: ${error.message}`);
    }
  },
  
  async sipTrunkOutboundCall(agentId, toNumber, agentPhoneNumberId, conversationInitiationClientData = null) {
    try {
      const requestBody = {
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: toNumber
      };

      // Add conversation_initiation_client_data if provided
      if (conversationInitiationClientData) {
        requestBody.conversation_initiation_client_data = conversationInitiationClientData;
      }

      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}/convai/sip-trunk/outbound-call`,
        requestBody,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json"
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to initiate outbound call: ${error.message}`);
    }
  }
};
