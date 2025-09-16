const express = require("express");
const router = express.Router();
const bankController = require("../controllers/bank.controller.js");
const {
  authenticateToken,
  requireAdmin,
} = require("../middleware/authMiddleware.js");

// Public routes (no authentication required)
// Get all banks
router.get("/", bankController.getAllBanks);

// Get banks by type (mobile or account)
router.get("/type/:type", bankController.getBanksByType);

// Get bank by number
router.get("/number/:number", bankController.getBankByNumber);

// Protected routes (authentication required)
// Get bank by ID
router.get("/:id", authenticateToken, bankController.getBankById);

// Admin routes (authentication + admin role required)
// Create new bank
router.post("/", authenticateToken, requireAdmin, bankController.createBank);

// Update bank
router.put("/:id", authenticateToken, requireAdmin, bankController.updateBank);

// Update bank details (simplified)
router.patch(
  "/:id/details",
  authenticateToken,
  requireAdmin,
  bankController.updateBankDetails
);

// Delete bank
router.delete(
  "/:id",
  authenticateToken,
  requireAdmin,
  bankController.deleteBank
);

module.exports = router;
