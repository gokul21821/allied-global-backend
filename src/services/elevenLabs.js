import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/agents";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsService = {
  async createAgent(name, config) {
    try {
      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}/create`,
        {
          name,
          conversation_config: config,
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("❌ ElevenLabs API Error (createAgent):");

      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Headers:", error.response.headers);
        console.error("Data:", error.response.data);
      } else if (error.request) {
        console.error("No response received from ElevenLabs:", error.request);
      } else {
        console.error("Error building request:", error.message);
      }

      throw new Error(`Failed to create agent: ${error.message}`);
    }
  },

  async updateAgent(agentId, name, config, platform_settings, workflow) {
    try {
      const payload = {
        name: name,
        conversation_config: config,
        platform_settings,
      };

      if (workflow !== undefined) {
        payload.workflow = workflow;
      }

      const response = await axios.patch(
        `${ELEVEN_LABS_API_URL}/${agentId}`,
        payload,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      console.error("ElevenLabs updateAgent error:", error.response?.data || error.message);
      const err = new Error("Failed to update agent");
      err.status = error.response?.status || 500;
      err.details = error.response?.data || null;
      throw err;
    }
  },

  async deleteAgent(agentId) {
    try {
      await axios.delete(`${ELEVEN_LABS_API_URL}/${agentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
    } catch (error) {
      throw new Error(`Failed to delete agent: ${error.message}`);
    }
  },

  async getAgent(agentId) {
    try {
      const response = await axios.get(`${ELEVEN_LABS_API_URL}/${agentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get agent: ${error.message}`);
    }
  },

  async listAgents() {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error listing agents:", error);
      throw new Error(`Failed to list agents: ${error.message}`);
    }
  },
};
