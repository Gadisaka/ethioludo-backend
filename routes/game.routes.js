const express = require("express");
const router = express.Router();
const gameController = require("../controllers/game.controller.js");
const { authenticateToken } = require("../middleware/authMiddleware");

// Get all games
router.get("/", gameController.getAllGames);

// Get game history for authenticated user
router.get("/history", authenticateToken, gameController.getGameHistory);

module.exports = router;
