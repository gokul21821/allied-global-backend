
import express from "express";
import { dashboardController } from "../controllers/dashboardController.js";

const router = express.Router();

router.get("/:user_id", dashboardController.getUserDashboard);

export default router;
