
import express from 'express';
import { secretController } from '../controllers/secretController.js';

const router = express.Router();

router.post('/create', secretController.createSecret);
router.patch('/:secret_id', secretController.updateSecret);

export default router;
