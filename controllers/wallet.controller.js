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

    // Check if sufficient balance (no fees)
    if (wallet.balance < amount) {
      return res.status(400).json({
        message: "Insufficient balance for withdrawal",
        requiredBalance: amount,
        currentBalance: wallet.balance,
      });
    }

    // Deduct balance immediately (balance is held until admin approval)
    wallet.balance -= amount;
    await wallet.save();

    // Create transaction record with PENDING status (no fees)
    const transaction = new Transaction({
      amount: amount,
      type: "WITHDRAW",
      status: "PENDING",
      description: `Withdrawal via ${withdrawalMethod} - Amount: ${amount} ብር - Account: ${accountDetails}`,
      user: userId,
      withdrawalMethod,
      accountDetails,
    });
    await transaction.save();

    // Create notification for pending withdrawal
    const notification = new Notification({
      user: userId,
      message: `Withdrawal request submitted for ${amount} ብር via ${withdrawalMethod}. Amount deducted from balance. Awaiting admin approval.`,
      type: "INFO",
    });
    await notification.save();

    // Emit socket event for real-time updates
    req.io.emit(`wallet_update_${userId}`, {
      type: "WITHDRAW_PENDING",
      balance: wallet.balance,
      amount: amount,
      transactionId: transaction._id,
    });

    // Emit notification event
    req.io.emit(`notification_${userId}`, {
      type: "WITHDRAW_PENDING",
      message: `Withdrawal request submitted for ${amount} ብር via ${withdrawalMethod}. Amount deducted from balance. Awaiting admin approval.`,
      notificationId: notification._id,
    });

    res.status(200).json({
      message:
        "Withdrawal request submitted successfully. Amount deducted from balance. Awaiting admin approval.",
      newBalance: wallet.balance, // Balance is deducted
      amountRequested: amount,
      transactionId: transaction._id,
      status: "PENDING",
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

// Approve pending withdrawal (admin only)
const approveWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Find the pending withdrawal transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.type !== "WITHDRAW") {
      return res.status(400).json({ message: "Not a withdrawal transaction" });
    }

    if (transaction.status !== "PENDING") {
      return res.status(400).json({ message: "Transaction is not pending" });
    }

    // Find user's wallet
    const wallet = await Wallet.findOne({ user: transaction.user });
    if (!wallet) {
      return res.status(404).json({ message: "User wallet not found" });
    }

    // Balance is already deducted when withdrawal was submitted, just approve

    // Update transaction status to completed
    transaction.status = "COMPLETED";
    transaction.description += " - Approved by admin";
    await transaction.save();

    // Create success notification
    const notification = new Notification({
      user: transaction.user,
      message: `Withdrawal approved! ${transaction.amount} ብር has been processed via ${transaction.withdrawalMethod}`,
      type: "SUCCESS",
    });
    await notification.save();

    // Emit socket events
    req.io.emit(`wallet_update_${transaction.user}`, {
      type: "WITHDRAW_APPROVED",
      balance: wallet.balance,
      amount: transaction.amount,
      transactionId: transaction._id,
    });

    req.io.emit(`notification_${transaction.user}`, {
      type: "WITHDRAW_APPROVED",
      message: `Withdrawal approved! ${transaction.amount} ብር has been processed via ${transaction.withdrawalMethod}`,
      notificationId: notification._id,
    });

    res.status(200).json({
      message: "Withdrawal approved successfully",
      transactionId: transaction._id,
      newBalance: wallet.balance,
    });
  } catch (error) {
    console.error("Error approving withdrawal:", error);
    res.status(500).json({
      message: "Error approving withdrawal",
      error: error.message,
    });
  }
};

// Reject pending withdrawal (admin only)
const rejectWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body;

    // Find the pending withdrawal transaction
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.type !== "WITHDRAW") {
      return res.status(400).json({ message: "Not a withdrawal transaction" });
    }

    if (transaction.status !== "PENDING") {
      return res.status(400).json({ message: "Transaction is not pending" });
    }

    // Find user's wallet and restore the balance
    const wallet = await Wallet.findOne({ user: transaction.user });
    if (wallet) {
      wallet.balance += transaction.amount;
      await wallet.save();
    }

    // Update transaction status to failed
    transaction.status = "FAILED";
    transaction.description += ` - Rejected by admin${
      reason ? `: ${reason}` : ""
    }`;
    await transaction.save();

    // Create notification
    const notification = new Notification({
      user: transaction.user,
      message: `Withdrawal request rejected${
        reason ? `: ${reason}` : ""
      }. Amount restored to your wallet.`,
      type: "ERROR",
    });
    await notification.save();

    // Emit socket events for real-time updates
    if (wallet) {
      req.io.emit(`wallet_update_${transaction.user}`, {
        type: "WITHDRAW_REJECTED",
        balance: wallet.balance,
        amount: transaction.amount,
        transactionId: transaction._id,
      });
    }

    // Emit notification event
    req.io.emit(`notification_${transaction.user}`, {
      type: "WITHDRAW_REJECTED",
      message: `Withdrawal request rejected${
        reason ? `: ${reason}` : ""
      }. Amount restored to your wallet.`,
      notificationId: notification._id,
    });

    res.status(200).json({
      message: "Withdrawal rejected successfully",
      transactionId: transaction._id,
    });
  } catch (error) {
    console.error("Error rejecting withdrawal:", error);
    res.status(500).json({
      message: "Error rejecting withdrawal",
      error: error.message,
    });
  }
};

// Get pending withdrawals (admin only)
const getPendingWithdrawals = async (req, res) => {
  try {
    const pendingWithdrawals = await Transaction.find({
      type: "WITHDRAW",
      status: "PENDING",
    })
      .populate("user", "username email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      pendingWithdrawals,
      total: pendingWithdrawals.length,
    });
  } catch (error) {
    console.error("Error fetching pending withdrawals:", error);
    res.status(500).json({
      message: "Error fetching pending withdrawals",
      error: error.message,
    });
  }
};

// Verify and process deposit with external transaction verification
const verifyDeposit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      referenceId, 
      receivedAmount, 
      receiverName, 
      receiverAccountNumber, 
      payerAccountNumber,
      paymentProvider 
    } = req.body;

    // Validate required fields
    if (!referenceId || !receivedAmount || !receiverName || !receiverAccountNumber || !paymentProvider) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields for verification"
      });
    }

    if (!["telebirr", "cbe"].includes(paymentProvider)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment provider"
      });
    }

    if (receivedAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount"
      });
    }

    // Check if transaction already exists (duplicate prevention)
    const existingTransaction = await Transaction.findOne({
      'verificationData.referenceId': referenceId,
      amount: receivedAmount,
      type: 'DEPOSIT'
    });

    if (existingTransaction) {
      return res.status(400).json({
        success: false,
        message: 'This transaction has already been processed'
      });
    }

    // Import and call the verification service
    const { verifyTransaction } = require('../services/verifyTransaction');
    
    // Verify with external service
    const verificationResult = await verifyTransaction(paymentProvider, {
      referenceId,
      receivedAmount: receivedAmount.toString(),
      receiverName,
      receiverAccountNumber,
      payerAccountNumber: payerAccountNumber || "none"
    });

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || "Transaction verification failed"
      });
    }

    // Verification successful - process the deposit
    // Find or create wallet
    let wallet = await Wallet.findOne({ user: userId });
    if (!wallet) {
      wallet = new Wallet({ user: userId, balance: 0 });
    }

    // Update balance
    wallet.balance += receivedAmount;
    await wallet.save();

    // Create transaction record with verification data
    const transaction = new Transaction({
      amount: receivedAmount,
      type: "DEPOSIT",
      status: "COMPLETED",
      description: `Deposit via ${paymentProvider} - Verified`,
      user: userId,
      externalTransactionId: referenceId,
      paymentProvider: paymentProvider,
      verificationData: {
        referenceId,
        receivedAmount,
        receiverName,
        receiverAccountNumber,
        payerAccountNumber: payerAccountNumber || "none",
        verifiedAt: new Date()
      }
    });
    await transaction.save();

    // Update user with wallet reference if not exists
    if (!req.user.wallet) {
      await User.findByIdAndUpdate(userId, { wallet: wallet._id });
    }

    // Create notification
    const notification = new Notification({
      user: userId,
      message: `Successfully deposited ${receivedAmount} ብር via ${paymentProvider} (Verified)`,
      type: "SUCCESS",
    });
    await notification.save();

    // Emit socket event for real-time updates
    req.io.emit(`wallet_update_${userId}`, {
      type: "DEPOSIT",
      balance: wallet.balance,
      amount: receivedAmount,
      transactionId: transaction._id,
    });

    // Emit notification event
    req.io.emit(`notification_${userId}`, {
      type: "DEPOSIT_SUCCESS",
      message: `Successfully deposited ${receivedAmount} ብር via ${paymentProvider} (Verified)`,
      notificationId: notification._id,
    });

    res.status(200).json({
      success: true,
      message: "Deposit verified and processed successfully",
      newBalance: wallet.balance,
      transactionId: transaction._id,
      verificationData: verificationResult.data
    });

  } catch (error) {
    console.error("Error verifying deposit:", error);
    res.status(500).json({
      success: false,
      message: "Error processing deposit verification",
      error: error.message,
    });
  }
};

module.exports = {
  getWalletBalance,
  depositFunds,
  withdrawFunds,
  verifyDeposit,
  deductGameStake,
  addGameWinnings,
  getAllTransactions,
  getTransactionHistory,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  approveWithdrawal,
  rejectWithdrawal,
  getPendingWithdrawals,
};
