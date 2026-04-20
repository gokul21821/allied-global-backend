
import express from 'express';
import { auditController } from '../controllers/auditController.js';

const router = express.Router();

// Admin-only routes for audit log access
router.get('/logs', auditController.getAuditLogs);
router.get('/logs/user/:userEmail', auditController.getUserAuditLogs);
router.get('/stats', auditController.getAuditStats);
router.get('/my-logs', auditController.getMyAuditLogs);
export default router;
