const express = require("express");
const router = express.Router();
const { getAds } = require("../controllers/ads.controller");

// GET /ads - Get all ads (public endpoint, no authentication required)
router.get("/", getAds);

module.exports = router;
