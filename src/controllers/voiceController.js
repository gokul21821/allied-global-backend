import { elevenLabsVoiceService } from "../services/elevenLabsVoice.js";

export const voiceController = {
  async listVoices(req, res) {
    try {
      const voices = await elevenLabsVoiceService.listVoices();
      res.json(voices);
    } catch (error) {
      console.error("Error listing voices:", error);
      res.status(500).json({ error: "Failed to list voices" });
    }
  },

  async getVoice(req, res) {
    try {
      const { voice_id } = req.params;
      const voice = await elevenLabsVoiceService.getVoice(voice_id);
      res.json(voice);
    } catch (error) {
      console.error("Error getting voice:", error);
      res.status(500).json({ error: "Failed to get voice" });
    }
  },

  async getSharedVoices(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const gender = req.query.gender || null;
      const accent = req.query.accent || null;
      const search = req.query.search || null;
      const sharedVoices = await elevenLabsVoiceService.getSharedVoices(page, gender, accent, search);
      res.json(sharedVoices);
    } catch (error) {
      console.error("Error getting shared voices:", error);
      res.status(500).json({ error: "Failed to get shared voices" });
    }
  },

  async addCustomVoice(req, res) {
    try {
      const { public_owner_id, voice_id, name } = req.body;

      if (!public_owner_id || !voice_id || !name) {
        return res.status(400).json({ 
          error: "public_owner_id, voice_id, and name are required" 
        });
      }

      const result = await elevenLabsVoiceService.addCustomVoice(
        public_owner_id, 
        voice_id, 
        name
      );
      res.json(result);
    } catch (error) {
      console.error("Error adding custom voice:", error);
      res.status(500).json({ error: "Failed to add custom voice" });
    }
  },
};
