const Wallet = require("../model/Wallet");
const Transaction = require("../model/Transaction");
const Notification = require("../model/Notification");
const User = require("../model/User");

// Get wallet balance for a user
const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      // Create wallet if it doesn't exist
      wallet = new Wallet({ user: userId, balance: 0 });
      await wallet.save();

      // Update user with wallet reference
      await User.findByIdAndUpdate(userId, { wallet: wallet._id });
    }

    res.status(200).json({
      balance: wallet.balance,
      walletId: wallet._id,
    });
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    res.status(500).json({
      message: "Error fetching wallet balance",
      error: error.message,
    });
  }
};

// Deposit funds to wallet
const depositFunds = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, paymentMethod, phoneNumber } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({ user: userId, balance: 0 });
    }

    // Update balance
    wallet.balance += amount;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      amount,
      type: "DEPOSIT",
      status: "COMPLETED",
      description: `Deposit via ${paymentMethod}`,
      user: userId,
    });
    await transaction.save();

    // Update user with wallet reference if not exists
    if (!req.user.wallet) {
      await User.findByIdAndUpdate(userId, { wallet: wallet._id });
    }

    // Create notification
    const notification = new Notification({
      user: userId,
      message: `Successfully deposited ${amount} ብር via ${paymentMethod}`,
      type: "SUCCESS",
    });
    await notification.save();

    // Emit socket event for real-time updates
    req.io.emit(`wallet_update_${userId}`, {
      type: "DEPOSIT",
      balance: wallet.balance,
      amount,
      transactionId: transaction._id,
    });

    // Emit notification event
    req.io.emit(`notification_${userId}`, {
      type: "DEPOSIT_SUCCESS",
      message: `Successfully deposited ${amount} ብር via ${paymentMethod}`,
      notificationId: notification._id,
    });

    res.status(200).json({
      message: "Deposit successful",
      newBalance: wallet.balance,
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("Error depositing funds:", error);
    res.status(500).json({
      message: "Error processing deposit",
      error: error.message,
    });
  }
};

// Withdraw funds from wallet
const withdrawFunds = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, withdrawalMethod, accountDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // Find wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Check if sufficient balance
    if (wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Calculate fees based on withdrawal method
    let fee = 0;
    switch (withdrawalMethod) {
      case "telebirr":
        fee = amount * 0.02; // 2%
        break;
      case "cbe":
        fee = 0; // Free
        break;
      case "awash":
        fee = amount * 0.01; // 1%
        break;
      case "ebirr":
        fee = amount * 0.015; // 1.5%
        break;
      default:
        fee = 0;
    }

    const totalDeduction = amount + fee;

    if (wallet.balance < totalDeduction) {
      return res.status(400).json({
        message: "Insufficient balance for withdrawal including fees",
        requiredBalance: totalDeduction,
        currentBalance: wallet.balance,
      });
    }

    // Update balance
    wallet.balance -= totalDeduction;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      amount: totalDeduction,
      type: "WITHDRAW",
      status: "COMPLETED",
      description: `Withdrawal via ${withdrawalMethod} - Amount: ${amount} ብር, Fee: ${fee} ብር`,
      user: userId,
    });
    await transaction.save();

    // Create notification
    const notification = new Notification({
      user: userId,
      message: `Successfully withdrew ${amount} ብር via ${withdrawalMethod}. Fee: ${fee} ብር`,
      type: "SUCCESS",
    });
    await notification.save();

    // Emit socket event for real-time updates
    req.io.emit(`wallet_update_${userId}`, {
      type: "WITHDRAW",
      balance: wallet.balance,
      amount: totalDeduction,
      transactionId: transaction._id,
    });

    // Emit notification event
    req.io.emit(`notification_${userId}`, {
      type: "WITHDRAW_SUCCESS",
      message: `Successfully withdrew ${amount} ብር via ${withdrawalMethod}. Fee: ${fee} ብር`,
      notificationId: notification._id,
    });

    res.status(200).json({
      message: "Withdrawal successful",
      newBalance: wallet.balance,
      amountWithdrawn: amount,
      fee,
      totalDeduction,
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    res.status(500).json({
      message: "Error processing withdrawal",
      error: error.message,
    });
  }
};

// Deduct game stake from player's wallet
const deductGameStake = async (
  userId,
  stake,
  roomId,
  gameType = "GAME_STAKE"
) => {
  try {
    // Find wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Check if sufficient balance
    if (wallet.balance < stake) {
      throw new Error("Insufficient balance for game stake");
    }

    // Update balance
    wallet.balance -= stake;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      amount: stake,
      type: gameType,
      status: "COMPLETED",
      description: `Game stake deducted for room ${roomId}`,
      user: userId,
    });
    await transaction.save();

    // Create notification
    const notification = new Notification({
      user: userId,
      message: `Game stake of ${stake} ብር deducted for room ${roomId}`,
      type: "INFO",
    });
    await notification.save();

    return {
      success: true,
      newBalance: wallet.balance,
      transactionId: transaction._id,
      notificationId: notification._id,
    };
  } catch (error) {
    console.error("Error deducting game stake:", error);
    throw error;
  }
};

// Add game winnings to player's wallet
const addGameWinnings = async (
  userId,
  stake,
  roomId,
  isBotGame = false,
  gameType = "GAME_WINNINGS"
) => {
  try {
    // Find wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Get dynamic cut percentage from database
    const { getCutPercentage } = require("./gameSetting.controller");
    const cutPercentage = await getCutPercentage();

    console.log(`[Wallet] Using dynamic cut percentage: ${cutPercentage}%`);

    // Calculate winnings based on game type
    let winnings;
    if (isBotGame) {
      // Human vs Bot: winner gets (2 x stake) - cut percentage
      winnings = 2 * stake - (2 * stake * cutPercentage) / 100;
    } else {
      // Human vs Human: winner gets (2 x stake) - cut percentage
      winnings = 2 * stake - (2 * stake * cutPercentage) / 100;
    }

    // Update balance
    wallet.balance += winnings;
    await wallet.save();

    // Create transaction record
    const transaction = new Transaction({
      amount: winnings,
      type: gameType,
      status: "COMPLETED",
      description: `Game winnings for room ${roomId}`,
      user: userId,
    });
    await transaction.save();

    // Create notification
    const notification = new Notification({
      user: userId,
      message: `Congratulations! You won ${winnings.toFixed(
        2
      )} ብር from room ${roomId}`,
      type: "SUCCESS",
    });
    await notification.save();

    return {
      success: true,
      newBalance: wallet.balance,
      winnings: winnings,
      transactionId: transaction._id,
      notificationId: notification._id,
    };
  } catch (error) {
    console.error("Error adding game winnings:", error);
    throw error;
  }
};

// Get all transactions (admin only)
const getAllTransactions = async (req, res) => {
  try {
    const Transaction = require("../model/Transaction.js");
    const transactions = await Transaction.find()
      .populate("user", "username email")
      .sort({ createdAt: -1 })
      .limit(100); // Limit to prevent performance issues

    res.status(200).json({
      transactions,
      total: transactions.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Error fetching all transactions:", error);
    res.status(500).json({
      message: "Error fetching transactions",
      error: error.message,
    });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments({ user: userId });

    res.status(200).json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({
      message: "Error fetching transaction history",
      error: error.message,
    });
  }
};

// Get notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;

    const notifications = await Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments({ user: userId });
    const unreadCount = await Notification.countDocuments({
      user: userId,
      status: "UNREAD",
    });

    res.status(200).json({
      notifications,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, user: userId },
      { status: "READ" },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      message: "Error updating notification",
      error: error.message,
    });
  }
};

// Mark all notifications as read
const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { user: userId, status: "UNREAD" },
      { status: "READ" }
    );

    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      message: "Error updating notifications",
      error: error.message,
    });
  }
};

module.exports = {
  getWalletBalance,
  depositFunds,
  withdrawFunds,
  deductGameStake,
  addGameWinnings,
  getAllTransactions,
  getTransactionHistory,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
};
