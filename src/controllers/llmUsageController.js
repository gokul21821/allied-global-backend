
import axios from "axios";

const ELEVEN_LABS_API_URL = "https://api.elevenlabs.io/v1/convai/llm-usage/calculate";
const API_KEY = process.env.ELEVEN_LABS_API_KEY;

export const llmUsageController = {
  async calculateUsage(req, res) {
    try {
      const { prompt_length, number_of_pages, rag_enabled } = req.body;

      // Validate required fields
      if (typeof prompt_length !== "number") {
        return res.status(400).json({ 
          error: "prompt_length is required and must be a number" 
        });
      }

      if (typeof number_of_pages !== "number") {
        return res.status(400).json({ 
          error: "number_of_pages is required and must be a number" 
        });
      }

      if (typeof rag_enabled !== "boolean") {
        return res.status(400).json({ 
          error: "rag_enabled is required and must be a boolean" 
        });
      }

      // Make request to ElevenLabs API
      const response = await axios.post(
        ELEVEN_LABS_API_URL,
        {
          prompt_length,
          number_of_pages,
          rag_enabled
        },
        {
          headers: {
            "xi-api-key": API_KEY,
            "Content-Type": "application/json"
          }
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error("Error calculating LLM usage:", error);
      
      if (error.response) {
        return res.status(error.response.status).json({
          error: error.response.data?.message || "Failed to calculate LLM usage"
        });
      }
      
      res.status(500).json({ error: "Failed to calculate LLM usage" });
    }
  }
};
