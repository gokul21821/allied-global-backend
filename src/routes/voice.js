import express from 'express';
import { voiceController } from '../controllers/voiceController.js';

const router = express.Router();

router.get('/list-voices', voiceController.listVoices);
router.get('/get-voice/:voice_id', voiceController.getVoice);
router.get('/shared-voices', voiceController.getSharedVoices);
router.post('/add-custom-voice', voiceController.addCustomVoice);

export default router;