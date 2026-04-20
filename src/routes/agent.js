import express from "express";
import { agentController } from "../controllers/agentController.js";

const router = express.Router();

router.post("/create", agentController.createAgent);
router.patch("/:user_id/:agent_id", agentController.updateAgent);
router.delete("/:user_id/:agent_id", agentController.deleteAgent);
router.get("/:user_id/:agent_id", agentController.getAgent);
router.get("/:user_id", agentController.listAgents);

export default router;