import express, { Router } from "express";
import { handleWebhook } from "../controllers/webhook.controller.js";

const router: Router = express.Router();

// ✅ Define route with proper typing
router.post("/", handleWebhook);

export default router;