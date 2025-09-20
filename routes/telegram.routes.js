const express = require("express");
const axios = require("axios");
const TelegramUser = require("../model/TelegramUser");
const router = express.Router();

// Save Telegram user
router.post("/save-user", async (req, res) => {
  try {
    const { telegramId, username, firstName, lastName, languageCode } =
      req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        message: "Telegram ID is required",
      });
    }

    // Use findOrCreate to handle both new and existing users
    const user = await TelegramUser.findOrCreate({
      telegramId: parseInt(telegramId),
      username: username || null,
      firstName: firstName || null,
      lastName: lastName || null,
      languageCode: languageCode || "en",
    });

    const totalUsers = await TelegramUser.getActiveUsersCount();

    console.log(
      `📱 Telegram user ${user.isNew ? "registered" : "updated"}: ${
        username || "Unknown"
      } (${telegramId})`
    );

    res.json({
      success: true,
      message: user.isNew
        ? "User registered successfully"
        : "User updated successfully",
      userCount: totalUsers,
      isNewUser: user.isNew,
    });
  } catch (error) {
    console.error("Error saving Telegram user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save user",
    });
  }
});

// Broadcast message to all Telegram users
router.post("/broadcast", async (req, res) => {
  try {
    const { message, type = "INFO" } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Use internal broadcast function
    const { broadcastToTelegramUsers } = require("../services/telegramBot.js");
    const result = await broadcastToTelegramUsers(message.trim(), type);

    res.json(result);
  } catch (error) {
    console.error("Error broadcasting message:", error);
    res.status(500).json({
      success: false,
      message: "Failed to broadcast message",
    });
  }
});

// Get broadcast statistics
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await TelegramUser.getActiveUsersCount();
    const users = await TelegramUser.getActiveUsers();

    // Get additional stats
    const totalMessagesSent = await TelegramUser.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: "$messagesReceived" } } },
    ]);

    const recentUsers = await TelegramUser.find({ isActive: true })
      .sort({ joinedAt: -1 })
      .limit(10)
      .select(
        "telegramId username firstName lastName joinedAt lastSeen messagesReceived"
      );

    res.json({
      success: true,
      totalUsers,
      totalMessagesSent: totalMessagesSent[0]?.total || 0,
      users: users.map((user) => ({
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        joinedAt: user.joinedAt,
        lastSeen: user.lastSeen,
        messagesReceived: user.messagesReceived,
      })),
      recentUsers: recentUsers.map((user) => ({
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        joinedAt: user.joinedAt,
        lastSeen: user.lastSeen,
        messagesReceived: user.messagesReceived,
      })),
    });
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get statistics",
    });
  }
});

module.exports = router;
