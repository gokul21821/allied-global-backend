import express from "express";
import multer from "multer";
import { knowledgeBaseController } from "../controllers/knowledgeBaseController.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

const router = express.Router();

router.post("/create", upload.single('file'), knowledgeBaseController.createKnowledgeBase);
router.get("/:user_id/:document_id", knowledgeBaseController.getKnowledgeBase);
router.delete("/:user_id/:document_id", knowledgeBaseController.deleteKnowledgeBase);
router.get("/:user_id", knowledgeBaseController.listKnowledgeBases);
router.get("/:user_id/:document_id/dependent-agents", knowledgeBaseController.getDependentAgents);

export default router;