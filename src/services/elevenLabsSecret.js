
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/secrets";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsSecretService = {
  async createSecret(name, value) {
    try {
      const response = await axios.post(
        ELEVEN_LABS_API_URL,
        {
          type: "new",
          name: name,
          value: value,
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
      throw new Error(`Failed to create secret: ${error.message}`);
    }
  },

  async updateSecret(secretId, name, value) {
    try {
      const response = await axios.patch(
        `${ELEVEN_LABS_API_URL}/${secretId}`,
        {
          type: "update",
          name: name,
          value: value,
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
      throw new Error(`Failed to update secret: ${error.message}`);
    }
  },
};
