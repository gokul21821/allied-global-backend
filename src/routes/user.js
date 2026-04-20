
import express from "express";
import { userController } from "../controllers/userController.js";

const router = express.Router();

router.delete('/delete', userController.deleteUser);
router.post('/create-managed', userController.createManagedUser);
router.patch('/toggle-status', userController.toggleUserStatus);

export default router;
