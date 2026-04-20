
import { elevenLabsSecretService } from "../services/elevenLabsSecret.js";

export const secretController = {
  async createSecret(req, res) {
    try {
      const { name, value } = req.body;

      if (!name || !value) {
        return res.status(400).json({ 
          error: "name and value are required" 
        });
      }

      const result = await elevenLabsSecretService.createSecret(name, value);
      res.json(result);
    } catch (error) {
      console.error("Error creating secret:", error);
      res.status(500).json({ error: "Failed to create secret" });
    }
  },

  async updateSecret(req, res) {
    try {
      const { secret_id } = req.params;
      const { name, value } = req.body;

      if (!name || !value) {
        return res.status(400).json({ 
          error: "name and value are required" 
        });
      }

      const result = await elevenLabsSecretService.updateSecret(secret_id, name, value);
      res.json(result);
    } catch (error) {
      console.error("Error updating secret:", error);
      res.status(500).json({ error: "Failed to update secret" });
    }
  },
};
