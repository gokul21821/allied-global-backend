import express from "express";
import { conversationController } from "../controllers/conversationController.js";

const router = express.Router();

router.post("/list-conversations", conversationController.listConversations);
router.post(
  "/get-conversation/:conversation_id",
  conversationController.getConversation,
);

export default router;
