import express from "express";
import { toolController } from "../controllers/toolController.js";

const router = express.Router();

router.post("/create", toolController.createTool);
router.get("/:user_id", toolController.listTools);
router.get("/:user_id/:tool_id", toolController.getTool);
router.patch("/:user_id/:tool_id", toolController.updateTool);
router.delete("/:user_id/:tool_id", toolController.deleteTool);

export default router;
