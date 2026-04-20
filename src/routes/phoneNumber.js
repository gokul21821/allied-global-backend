import express from "express";
import { phoneNumberController } from "../controllers/phoneNumberController.js";

const router = express.Router();

router.post("/create", phoneNumberController.createPhoneNumber);
router.get("/:user_id/:phone_number_id", phoneNumberController.getPhoneNumber);
router.patch(
  "/:user_id/:phone_number_id",
  phoneNumberController.updatePhoneNumber,
);
router.delete(
  "/:user_id/:phone_number_id",
  phoneNumberController.deletePhoneNumber,
);
router.get("/:user_id", phoneNumberController.listPhoneNumbers);

export default router;
