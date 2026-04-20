
import express from "express";
import { llmUsageController } from "../controllers/llmUsageController.js";

const router = express.Router();

router.post("/calculate", llmUsageController.calculateUsage);

export default router;
