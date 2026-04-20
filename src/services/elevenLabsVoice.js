import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/voices";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsVoiceService = {
  async listVoices() {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list voices: ${error.message}`);
    }
  },

  async getVoice(voiceId) {
    try {
      const response = await axios.get(`${ELEVEN_LABS_API_URL}/${voiceId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get voice: ${error.message}`);
    }
  },

  async getSharedVoices(page = 1, gender = null, accent = null, search = null) {
    try {
      const params = {
        page_size: 15,
      };

      // Only include page if no filters are applied
      const hasFilters = gender || accent || search;
      if (!hasFilters) {
        params.page = page;
      }

      if (gender) {
        params.gender = gender;
      }

      if (accent) {
        params.accent = accent;
      }

      if (search) {
        params.search = search;
      }

      const response = await axios.get("https://api.elevenlabs.io/v1/shared-voices", {
        headers: {
          "xi-api-key": API_KEY,
        },
        params: params,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get shared voices: ${error.message}`);
    }
  },

  async addCustomVoice(publicOwnerId, voiceId, newName) {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/voices/add/${publicOwnerId}/${voiceId}`,
        {
          new_name: newName,
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
      throw new Error(`Failed to add custom voice: ${error.message}`);
    }
  },
};
