const express = require("express");
const router = express.Router();
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware.js");

// Apply authentication middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Admin Dashboard Overview - Get all data for dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const GameHistory = require("../model/GameHistory.js");
    const Transaction = require("../model/Transaction.js");
    const GameSetting = require("../model/gameSetting.js");

    // Get users count
    const users = await User.find().select("username email status createdAt");

    // Get games count and stats
    const games = await GameHistory.find().select(
      "status type players stake winnerId createdAt requiredPieces"
    );

    // Get all transactions for revenue calculation
    const transactions = await Transaction.find()
      .populate("user", "username email")
      .select("type status amount description createdAt")
      .sort({ createdAt: -1 })
      .limit(100);

    // Get cut percentage setting
    let cutPercentage = 10; // Default fallback
    try {
      const cutSetting = await GameSetting.findOne({
        settingKey: "GAME_CUT_PERCENTAGE",
      });
      if (cutSetting) {
        cutPercentage = parseFloat(cutSetting.settingValue) || 10;
      }
    } catch (error) {
      console.error("Error fetching cut percentage:", error);
    }

    // Return combined dashboard data
    res.status(200).json({
      users: users,
      games: games,
      transactions: transactions,
      cutPercentage: cutPercentage,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching admin dashboard data:", error);
    res.status(500).json({
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
});

// Admin - Get All Transactions (without user restriction)
router.get("/transactions", async (req, res) => {
  try {
    const Transaction = require("../model/Transaction.js");
    const Wallet = require("../model/Wallet.js");

    const transactions = await Transaction.find()
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent performance issues

    // Get wallet balances for each user
    const enrichedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        let balance = 0;
        if (transaction.user && transaction.user._id) {
          const wallet = await Wallet.findOne({ user: transaction.user._id });
          balance = wallet ? wallet.balance : 0;
        }

        return {
          ...transaction.toObject(),
          balance: balance,
        };
      })
    );

    res.status(200).json({
      transactions: enrichedTransactions,
      total: enrichedTransactions.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching admin transactions:", error);
    res.status(500).json({
      message: "Error fetching transactions",
      error: error.message,
    });
  }
});

// Admin - Get Transaction Statistics
router.get("/transactions/stats", async (req, res) => {
  try {
    const Transaction = require("../model/Transaction.js");

    const totalTransactions = await Transaction.countDocuments();
    const totalAmount = await Transaction.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    const statusStats = await Transaction.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    const typeStats = await Transaction.aggregate([
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          total: { $sum: "$amount" },
        },
      },
    ]);

    res.status(200).json({
      totalTransactions,
      totalAmount: totalAmount[0]?.total || 0,
      statusStats,
      typeStats,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching transaction stats:", error);
    res.status(500).json({
      message: "Error fetching transaction stats",
      error: error.message,
    });
  }
});

// Admin - Get All Users
router.get("/users", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const GameHistory = require("../model/GameHistory.js");
    const Transaction = require("../model/Transaction.js");

    const users = await User.find({})
      .select("_id username phone isActive createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent performance issues

    // Calculate statistics for each user from existing data
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        try {
          // Get all games where user participated
          const userGames = await GameHistory.find({
            $or: [
              { user: user._id }, // Games where user is the primary player
              { "players.userId": user._id.toString() }, // Games where user is in players array
            ],
          });

          // Count total games
          const totalGames = userGames.length;

          // Count games won by this user
          const gamesWon = userGames.filter(
            (game) =>
              game.winnerId === user._id.toString() &&
              game.status === "finished"
          ).length;

          // Calculate win rate
          const winRate =
            totalGames > 0 ? ((gamesWon / totalGames) * 100).toFixed(1) : "0.0";

          // Calculate total winnings from GAME_WINNINGS transactions
          const winningsResult = await Transaction.aggregate([
            {
              $match: {
                user: user._id,
                type: "GAME_WINNINGS",
                status: "COMPLETED",
              },
            },
            {
              $group: {
                _id: null,
                totalWinnings: { $sum: "$amount" },
              },
            },
          ]);

          const totalWinnings =
            winningsResult.length > 0 ? winningsResult[0].totalWinnings : 0;

          // Calculate total stakes from games
          const totalStakes = userGames.reduce(
            (sum, game) => sum + (game.stake || 0),
            0
          );

          // Calculate net profit
          const netProfit = totalWinnings - totalStakes;

          // Get game type distribution
          const gamesByType = { 1: 0, 2: 0, 3: 0, 4: 0 };
          userGames.forEach((game) => {
            if (
              game.requiredPieces &&
              gamesByType[game.requiredPieces] !== undefined
            ) {
              gamesByType[game.requiredPieces]++;
            }
          });

          // Get last game played and last game won
          const lastGamePlayed =
            userGames.length > 0
              ? new Date(Math.max(...userGames.map((g) => g.createdAt)))
              : null;

          const wonGames = userGames.filter(
            (game) =>
              game.winnerId === user._id.toString() &&
              game.status === "finished"
          );
          const lastGameWon =
            wonGames.length > 0
              ? new Date(Math.max(...wonGames.map((g) => g.createdAt)))
              : null;

          return {
            ...user.toObject(),
            totalGames,
            gamesWon,
            winRate: `${winRate}%`,
            totalWinnings,
            totalStakes,
            netProfit,
            gamesByType,
            lastGamePlayed,
            lastGameWon,
          };
        } catch (error) {
          console.error(`Error calculating stats for user ${user._id}:`, error);
          return {
            ...user.toObject(),
            totalGames: 0,
            gamesWon: 0,
            winRate: "0.0%",
            totalWinnings: 0,
            totalStakes: 0,
            netProfit: 0,
            gamesByType: { 1: 0, 2: 0, 3: 0, 4: 0 },
            lastGamePlayed: null,
            lastGameWon: null,
          };
        }
      })
    );

    res.status(200).json({
      success: true,
      users: usersWithStats,
      total: usersWithStats.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching admin users:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
      error: error.message,
    });
  }
});

// Admin - Get User Statistics
router.get("/users/stats", async (req, res) => {
  try {
    const User = require("../model/User.js");

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const newUsers = await User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    const bannedUsers = await User.countDocuments({ isActive: false });

    res.status(200).json({
      totalUsers,
      activeUsers,
      newUsers,
      bannedUsers,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({
      message: "Error fetching user stats",
      error: error.message,
    });
  }
});

// Admin - Recalculate All User Statistics
router.post("/users/recalculate-stats", async (req, res) => {
  try {
    const { recalculateAllUserStats } = require("../utils/userStatsUpdater.js");

    // Start the recalculation process
    recalculateAllUserStats();

    res.status(200).json({
      success: true,
      message:
        "User statistics recalculation started. This may take a few minutes.",
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error starting user stats recalculation:", error);
    res.status(500).json({
      success: false,
      message: "Error starting user stats recalculation",
      error: error.message,
    });
  }
});

// Admin - Update User Status
router.patch("/users/:userId/status", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const { userId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      user: {
        _id: user._id,
        username: user.username,
        isActive: user.isActive,
        updatedAt: user.updatedAt,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating user status",
      error: error.message,
    });
  }
});

// Admin - Delete User
router.delete("/users/:userId", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const GameHistory = require("../model/GameHistory.js");
    const Transaction = require("../model/Transaction.js");
    const Wallet = require("../model/Wallet.js");
    const Notification = require("../model/Notification.js");

    const { userId } = req.params;

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete related data
    await Promise.all([
      // Delete user's game history
      GameHistory.deleteMany({ user: userId }),
      // Delete user's transactions
      Transaction.deleteMany({ user: userId }),
      // Delete user's wallet
      Wallet.deleteMany({ user: userId }),
      // Delete user's notifications
      Notification.deleteMany({ user: userId }),
    ]);

    // Finally delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: "User and all associated data deleted successfully",
      deletedUser: {
        _id: user._id,
        username: user.username,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting user",
      error: error.message,
    });
  }
});

// Admin - Send Notification to All Users
router.post("/send-notification", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const Notification = require("../model/Notification.js");
    const axios = require("axios");

    const { message, type = "INFO" } = req.body;

    // Validate message
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Notification message is required",
      });
    }

    if (message.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: "Notification message must be 500 characters or less",
      });
    }

    // Validate type - must be one of the enum values
    const validTypes = ["INFO", "SUCCESS", "WARNING", "ERROR"];
    const notificationType = validTypes.includes(type) ? type : "INFO";

    // Get all active users (check if isActive field exists, otherwise get all users)
    let users;
    try {
      users = await User.find({ isActive: true }).select("_id");
      if (users.length === 0) {
        // If no active users found, try getting all users
        users = await User.find({}).select("_id");
      }
    } catch (error) {
      console.log(
        "isActive field might not exist, getting all users:",
        error.message
      );
      users = await User.find({}).select("_id");
    }

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found",
      });
    }

    // Create notifications for all users
    const notifications = users.map((user) => ({
      user: user._id,
      type: notificationType,
      message: message.trim(),
      status: "UNREAD",
    }));

    // Bulk insert notifications
    const createdNotifications = await Notification.insertMany(notifications);

    // Send to Telegram users as well using internal function
    let telegramResult = null;
    try {
      const {
        broadcastToTelegramUsers,
      } = require("../services/telegramBot.js");
      telegramResult = await broadcastToTelegramUsers(
        message.trim(),
        notificationType
      );

      if (telegramResult.success) {
        console.log(
          `📱 Telegram broadcast: ${telegramResult.sentCount}/${telegramResult.totalUsers} users reached`
        );
      }
    } catch (telegramError) {
      console.error("Error sending Telegram broadcast:", telegramError.message);
      telegramResult = {
        success: false,
        error: telegramError.message,
      };
    }

    res.status(200).json({
      success: true,
      message: "Notification sent successfully to all users",
      userCount: users.length,
      notificationCount: createdNotifications.length,
      telegramResult,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error sending notification to all users:", error);
    res.status(500).json({
      success: false,
      message: "Error sending notification",
      error: error.message,
    });
  }
});

// Admin - Get Game Statistics
router.get("/games/stats", async (req, res) => {
  try {
    const GameHistory = require("../model/GameHistory.js");

    const totalGames = await GameHistory.countDocuments();
    const activeGames = await GameHistory.countDocuments({ status: "playing" });
    const completedGames = await GameHistory.countDocuments({
      status: "completed",
    });
    const totalStakes = await GameHistory.aggregate([
      { $group: { _id: null, total: { $sum: "$stake" } } },
    ]);

    res.status(200).json({
      totalGames,
      activeGames,
      completedGames,
      totalStakes: totalStakes[0]?.total || 0,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching game stats:", error);
    res.status(500).json({
      message: "Error fetching game stats",
      error: error.message,
    });
  }
});

// Get all games for admin
router.get("/games", async (req, res) => {
  try {
    const GameHistory = require("../model/GameHistory.js");
    const games = await GameHistory.find({})
      .select(
        "_id requiredPieces status stake players createdAt updatedAt winnerId roomId"
      )
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      games: games,
      total: games.length,
    });
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch games",
      error: error.message,
    });
  }
});

// Admin - Update Transaction Status
router.patch("/transactions/:transactionId/status", async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;

    if (
      !status ||
      !["PENDING", "COMPLETED", "REJECTED", "FAILED"].includes(
        status.toUpperCase()
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be PENDING, COMPLETED, REJECTED, or FAILED",
      });
    }

    const Transaction = require("../model/Transaction.js");
    const transaction = await Transaction.findByIdAndUpdate(
      transactionId,
      {
        status: status.toUpperCase(),
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Transaction status updated successfully",
      transaction: {
        _id: transaction._id,
        status: transaction.status,
        updatedAt: transaction.updatedAt,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error updating transaction status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating transaction status",
      error: error.message,
    });
  }
});

// Admin - Update Game Status
router.patch("/games/:gameId/status", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { status } = req.body;

    if (
      !status ||
      !["waiting", "playing", "paused", "completed", "cancelled"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid status. Must be waiting, playing, paused, completed, or cancelled",
      });
    }

    const GameHistory = require("../model/GameHistory.js");
    const game = await GameHistory.findByIdAndUpdate(
      gameId,
      {
        status: status,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!game) {
      return res.status(404).json({
        success: false,
        message: "Game not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Game status updated successfully",
      game: {
        _id: game._id,
        status: game.status,
        updatedAt: game.updatedAt,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error updating game status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating game status",
      error: error.message,
    });
  }
});

// Admin - Get Current Admin Profile
router.get("/profile", async (req, res) => {
  try {
    const User = require("../model/User.js");

    // Get admin ID from token (stored in req.user after auth middleware)
    const adminId = req.user.id;

    const admin = await User.findById(adminId).select(
      "_id username phone email role createdAt updatedAt"
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    res.status(200).json({
      success: true,
      admin: admin,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching admin profile",
      error: error.message,
    });
  }
});

// Admin - Update Admin Profile
router.patch("/profile", async (req, res) => {
  try {
    const User = require("../model/User.js");
    const bcrypt = require("bcryptjs");

    // Get admin ID from token (stored in req.user after auth middleware)
    const adminId = req.user.id;

    const { phone, email, currentPassword, newPassword } = req.body;

    // Validate input
    if (!phone || phone.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    if (!email || email.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Get current admin data
    const currentAdmin = await User.findById(adminId);
    if (!currentAdmin) {
      return res.status(404).json({
        success: false,
        message: "Admin profile not found",
      });
    }

    // Check if phone is being changed and if it already exists
    if (phone && phone !== currentAdmin.phone) {
      const existingUser = await User.findOne({ phone: phone });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== currentAdmin.email) {
      const existingUser = await User.findOne({ email: email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // Prepare update data
    const updateData = {
      phone: phone.trim(),
      email: email.trim(),
      updatedAt: new Date(),
    };

    // Handle password change if provided
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password is required to change password",
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        currentAdmin.password
      );
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const saltRounds = 10;
      updateData.password = await bcrypt.hash(newPassword, saltRounds);
    }

    // Update admin profile
    const updatedAdmin = await User.findByIdAndUpdate(adminId, updateData, {
      new: true,
      runValidators: true,
    }).select("_id username phone email role createdAt updatedAt");

    res.status(200).json({
      success: true,
      message: "Admin profile updated successfully",
      admin: updatedAdmin,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error updating admin profile:", error);
    res.status(500).json({
      success: false,
      message: "Error updating admin profile",
      error: error.message,
    });
  }
});

module.exports = router;
