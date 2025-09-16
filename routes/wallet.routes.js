const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller.js");
const { authenticateToken } = require("../middleware/authMiddleware.js");

// Apply authentication middleware to all wallet routes
router.use(authenticateToken);

// Wallet balance
router.get("/balance", walletController.getWalletBalance);

// Deposit funds
router.post("/deposit", walletController.depositFunds);

// Verify and process deposit with external verification
router.post("/verify-deposit", walletController.verifyDeposit);

// Withdraw funds
router.post("/withdraw", walletController.withdrawFunds);

// Transaction history
router.get("/transactions", walletController.getTransactionHistory);

// Notifications
router.get("/notifications", walletController.getNotifications);

// Mark notification as read
router.put(
  "/notifications/:notificationId/read",
  walletController.markNotificationAsRead
);

// Mark all notifications as read
router.put(
  "/notifications/read-all",
  walletController.markAllNotificationsAsRead
);

// Admin routes for withdrawal management
router.get(
  "/admin/pending-withdrawals",
  walletController.getPendingWithdrawals
);
router.put(
  "/admin/withdrawals/:transactionId/approve",
  walletController.approveWithdrawal
);
router.put(
  "/admin/withdrawals/:transactionId/reject",
  walletController.rejectWithdrawal
);

module.exports = router;
