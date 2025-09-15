const express = require("express");
const router = express.Router();
const {
  getAllSettings,
  getSetting,
  updateSetting,
  initializeDefaultSettings,
} = require("../controllers/gameSetting.controller");

// Initialize default settings (admin only)
router.post("/initialize", initializeDefaultSettings);

// Get all settings (admin only)
router.get("/", getAllSettings);

// Get specific setting (admin only)
router.get("/:key", getSetting);

// Update specific setting (admin only)
router.put("/:key", updateSetting);

module.exports = router;
