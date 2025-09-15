const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller.js");

// Get all players
router.get("/", userController.getAllPlayersWithBalance);
// Get player by ID
router.get("/:id", userController.getPlayerById);
// Update player by ID
router.put("/:id", userController.changePassword);
// Delete player by ID
router.delete("/:id", userController.deletePlayer);

module.exports = router;
