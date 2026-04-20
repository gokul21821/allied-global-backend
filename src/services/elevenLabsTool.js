import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/tools";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsToolService = {
  async createTool(toolConfig) {
    try {
      console.log("ElevenLabs Create Tool Payload:", JSON.stringify({
        tool_config: {
          ...toolConfig,
        },
      }, null, 2));
      const response = await axios.post(
        ELEVEN_LABS_API_URL,
        {
          tool_config: {
            ...toolConfig,
          },
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        console.error("ElevenLabs API Error Details:", JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to create tool: ${error.message}`);
    }
  },

  async listTools() {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list tools: ${error.message}`);
    }
  },

  async getTool(toolId) {
    try {
      const response = await axios.get(`${ELEVEN_LABS_API_URL}/${toolId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get tool: ${error.message}`);
    }
  },

  async updateTool(toolId, toolConfig) {
    try {
      const response = await axios.patch(
        `${ELEVEN_LABS_API_URL}/${toolId}`,
        {
          tool_config: {
            ...toolConfig,
          },
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update tool: ${error.message}`);
    }
  },

  async deleteTool(toolId) {
    try {
      await axios.delete(`${ELEVEN_LABS_API_URL}/${toolId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
    } catch (error) {
      throw new Error(`Failed to delete tool: ${error.message}`);
    }
  },
};
