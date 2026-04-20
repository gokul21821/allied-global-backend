import axios from "axios";
import dotenv from "dotenv";
import FormData from "form-data";

dotenv.config();

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/knowledge-base";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const elevenLabsKnowledgeBaseService = {
  async createKnowledgeBase(fileData, url) {
    try {
      const formData = new FormData();

      if (fileData) {
        formData.append('file', fileData.buffer, {
          filename: fileData.originalname,
          contentType: fileData.mimetype
        });
      }

      if (url) {
        formData.append('url', url);
      }

      const response = await axios.post(ELEVEN_LABS_API_URL, formData, {
        headers: {
          "xi-api-key": API_KEY,
          ...formData.getHeaders()
        },
      });

      return response.data;
    } catch (error) {
      throw new Error(`Failed to create knowledge base: ${error.message}`);
    }
  },

  async getKnowledgeBase(documentId) {
    try {
      const response = await axios.get(`${ELEVEN_LABS_API_URL}/${documentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get knowledge base: ${error.message}`);
    }
  },

  async deleteKnowledgeBase(documentId) {
    try {
      const response = await axios.delete(`${ELEVEN_LABS_API_URL}/${documentId}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to delete knowledge base: ${error.message}`);
    }
  },

  async listKnowledgeBases(cursor, pageSize) {
    try {
      const params = new URLSearchParams();
      if (cursor) {
        params.append('cursor', cursor);
      }
      if (pageSize) {
        params.append('page_size', pageSize.toString());
      }

      const response = await axios.get(`${ELEVEN_LABS_API_URL}?${params.toString()}`, {
        headers: {
          "xi-api-key": API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to list knowledge bases: ${error.message}`);
    }
  },

  async getDependentAgents(documentId, cursor, pageSize) {
    try {
      const params = new URLSearchParams();
      if (cursor) {
        params.append('cursor', cursor);
      }
      if (pageSize) {
        params.append('page_size', pageSize.toString());
      }

      const response = await axios.get(
        `${ELEVEN_LABS_API_URL}/${documentId}/dependent-agents?${params.toString()}`,
        {
          headers: {
            "xi-api-key": API_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get dependent agents: ${error.message}`);
    }
  },
};