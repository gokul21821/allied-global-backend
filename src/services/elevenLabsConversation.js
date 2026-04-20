import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/conversations";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsConversationService = {
  async listConversations(agentId) {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
        params: {
          agent_id: agentId,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list conversations: ${error.message}`);
    }
  },

  async getConversation(conversationId) {
    try {
      const [conversationData, audioResponse] = await Promise.all([
        axios.get(`${ELEVEN_LABS_API_URL}/${conversationId}`, {
          headers: {
            "xi-api-key": API_KEY,
          },
        }),
        axios.get(`${ELEVEN_LABS_API_URL}/${conversationId}/audio`, {
          headers: {
            "xi-api-key": API_KEY,
          },
          responseType: "arraybuffer",
        }),
      ]);

      return {
        conversation: conversationData.data,
        audio: Buffer.from(audioResponse.data).toString("base64"),
      };
    } catch (error) {
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  },
};
