import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/phone-numbers";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsPhoneNumberService = {
  async createPhoneNumber(phoneNumberData, userId = "system") {
    let responseData = null;
    try {
      const payload = {
        phone_number: phoneNumberData.phone_number,
        provider: phoneNumberData.provider,
        label: phoneNumberData.label,
      };

      if (phoneNumberData.provider === "twilio") {
        payload.sid = phoneNumberData.sid;
        payload.token = phoneNumberData.token;
      }

      const finalPayload =
        phoneNumberData.provider === "twilio"
          ? payload
          : {
              phone_number: phoneNumberData.phone_number,
              label: phoneNumberData.label,
              provider: "sip_trunk",
              outbound_trunk_config: {
                address: phoneNumberData.address,
                transport: "tls",
                credentials: {
                  username: phoneNumberData.credentials.username,
                  password: phoneNumberData.credentials.password,
                },
                media_encryption: "allowed",
              },
              inbound_trunk_config: {
                credentials: {
                  username: phoneNumberData.credentials.username,
                  password: phoneNumberData.credentials.password,
                },
                media_encryption: "allowed",
              },
              supports_outbound: true,
              supports_inbound: true,
            };

      // Log the request payload (without sensitive data)
      console.log("ElevenLabs API Request:", {
        url: ELEVEN_LABS_API_URL,
        provider: phoneNumberData.provider,
        phone_number: phoneNumberData.phone_number,
        label: phoneNumberData.label,
        // Don't log credentials/tokens
      });

      const response = await axios.post(
        `${ELEVEN_LABS_API_URL}`,
        finalPayload,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      responseData = response.data;

      return responseData;
    } catch (error) {
      // Enhanced error logging
      console.error("ElevenLabs API Error Details:", {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        provider: phoneNumberData.provider,
        phone_number: phoneNumberData.phone_number,
      });

      // Include API error details in the thrown error
      let apiError =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message;

      if (typeof apiError === "object") {
        apiError = JSON.stringify(apiError);
      }

      throw new Error(`Failed to create phone number: ${apiError}`);
    }
  },

  async getPhoneNumber(phoneNumberId, userId = "system") {
    try {
      const response = await axios.get(
        `${ELEVEN_LABS_API_URL}/${phoneNumberId}`,
        {
          headers: {
            "xi-api-key": API_KEY,
          },
        },
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get phone number: ${error.message}`);
    }
  },

  async updatePhoneNumber(phoneNumberId, updateData, userId = "system") {
    let responseData = null;
    try {
      // Get current state for before/after comparison
      const beforeState = await this.getPhoneNumber(phoneNumberId, userId);

      const response = await axios.patch(
        `${ELEVEN_LABS_API_URL}/${phoneNumberId}`,
        updateData,
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
          },
        },
      );

      responseData = response.data;

      return responseData;
    } catch (error) {
      throw new Error(`Failed to update phone number: ${error.message}`);
    }
  },

  async deletePhoneNumber(phoneNumberId, userId = "system") {
    try {
      // Get current state before deletion
      const beforeState = await this.getPhoneNumber(phoneNumberId, userId);

      await axios.delete(`${ELEVEN_LABS_API_URL}/${phoneNumberId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
    } catch (error) {
      throw new Error(`Failed to delete phone number: ${error.message}`);
    }
  },

  async listPhoneNumbers() {
    try {
      const response = await axios.get(ELEVEN_LABS_API_URL, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list phone numbers: ${error.message}`);
    }
  },
};
