
import express from "express";
import { batchCallController } from "../controllers/batchCallController.js";

const router = express.Router();

router.post("/", batchCallController.createBatchCall);
router.get("/:user_id/:batch_call_id", batchCallController.getBatchCall);

export default router;
