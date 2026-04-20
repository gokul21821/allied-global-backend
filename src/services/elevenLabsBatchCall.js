
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/batch-calling";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsBatchCallService = {
  async createBatchCall(agentId, agentPhoneNumberId, recipients, callName, scheduledTimeUnix) {
    try {
      const payload = {
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        recipients: recipients,
        call_name: callName,
        scheduled_time_unix: scheduledTimeUnix
      };

      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}/submit`,
        payload,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json"
          }
        }
      );
      return response.data;
    } catch (error) {
      console.log(error)
      throw new Error(`Failed to create batch call: ${error.message}`);
    }
  },

  async getBatchCall(batchCallId) {
    try {
      const response = await axios.get(
        `${ELEVEN_LABS_API_URL}/${batchCallId}`,
        {
          headers: {
            "xi-api-key": API_KEY
          }
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get batch call: ${error.message}`);
    }
  }
};
