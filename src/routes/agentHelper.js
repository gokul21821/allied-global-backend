import express from "express";
import { getCurrentTime } from "../controllers/agentHelpers.js";

const router = express.Router()

router.get("/current-time", getCurrentTime);

export default router;