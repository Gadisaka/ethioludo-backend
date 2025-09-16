const Bank = require("../model/Bank");

// Get all banks
const getAllBanks = async (req, res) => {
  try {
    const banks = await Bank.find({ isActive: true })
      .select("number bankName accountFullName")
      .sort({ bankName: 1 });

    res.status(200).json({
      success: true,
      banks,
      total: banks.length,
    });
  } catch (error) {
    console.error("Error fetching banks:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching banks",
      error: error.message,
    });
  }
};

// Get bank by ID
const getBankById = async (req, res) => {
  try {
    const { id } = req.params;
    const bank = await Bank.findById(id);

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank not found",
      });
    }

    res.status(200).json({
      success: true,
      bank,
    });
  } catch (error) {
    console.error("Error fetching bank:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching bank",
      error: error.message,
    });
  }
};

// Get bank by number
const getBankByNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const bank = await Bank.findOne({ number, isActive: true });

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank not found",
      });
    }

    res.status(200).json({
      success: true,
      bank,
    });
  } catch (error) {
    console.error("Error fetching bank by number:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching bank",
      error: error.message,
    });
  }
};

// Create new bank (admin only)
const createBank = async (req, res) => {
  try {
    const { number, bankName, accountFullName } = req.body;

    // Check if bank with same number already exists
    const existingBank = await Bank.findOne({ number });
    if (existingBank) {
      return res.status(400).json({
        success: false,
        message: "Bank with this number already exists",
      });
    }

    const bank = new Bank({
      number,
      bankName,
      accountFullName,
    });

    await bank.save();

    res.status(201).json({
      success: true,
      message: "Bank created successfully",
      bank,
    });
  } catch (error) {
    console.error("Error creating bank:", error);
    res.status(500).json({
      success: false,
      message: "Error creating bank",
      error: error.message,
    });
  }
};

// Update bank (admin only)
const updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const { number, bankName, accountFullName, isActive } = req.body;

    const bank = await Bank.findByIdAndUpdate(
      id,
      {
        number,
        bankName,
        accountFullName,
        isActive,
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    );

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bank updated successfully",
      bank,
    });
  } catch (error) {
    console.error("Error updating bank:", error);
    res.status(500).json({
      success: false,
      message: "Error updating bank",
      error: error.message,
    });
  }
};

// Update bank details (simplified for admin interface)
const updateBankDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { number, accountFullName } = req.body;

    // Validate required fields
    if (!number || !accountFullName) {
      return res.status(400).json({
        success: false,
        message: "Bank number and account full name are required",
      });
    }

    // Check if bank exists
    const existingBank = await Bank.findById(id);
    if (!existingBank) {
      return res.status(404).json({
        success: false,
        message: "Bank not found",
      });
    }

    // Check if number is already used by another bank
    const duplicateBank = await Bank.findOne({
      number,
      _id: { $ne: id },
    });

    if (duplicateBank) {
      return res.status(400).json({
        success: false,
        message: "Bank number already exists",
      });
    }

    // Update bank
    const bank = await Bank.findByIdAndUpdate(
      id,
      {
        number,
        accountFullName,
        updatedAt: Date.now(),
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Bank details updated successfully",
      bank: {
        _id: bank._id,
        number: bank.number,
        bankName: bank.bankName,
        accountFullName: bank.accountFullName,
        isActive: bank.isActive,
        updatedAt: bank.updatedAt,
      },
    });
  } catch (error) {
    console.error("Error updating bank details:", error);
    res.status(500).json({
      success: false,
      message: "Error updating bank details",
      error: error.message,
    });
  }
};

// Delete bank (admin only)
const deleteBank = async (req, res) => {
  try {
    const { id } = req.params;

    const bank = await Bank.findByIdAndDelete(id);

    if (!bank) {
      return res.status(404).json({
        success: false,
        message: "Bank not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Bank deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting bank:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting bank",
      error: error.message,
    });
  }
};

// Get banks by payment method type
const getBanksByType = async (req, res) => {
  try {
    const { type } = req.params; // 'mobile' or 'account'

    let banks;
    if (type === "mobile") {
      banks = await Bank.find({
        isActive: true,
        bankName: { $in: ["TeleBirr", "CBE birr"] },
      })
        .select("number bankName accountFullName")
        .sort({ bankName: 1 });
    } else if (type === "account") {
      banks = await Bank.find({
        isActive: true,
        bankName: { $in: ["CBE", "Bank of Abyssinia"] },
      })
        .select("number bankName accountFullName")
        .sort({ bankName: 1 });
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use 'mobile' or 'account'",
      });
    }

    res.status(200).json({
      success: true,
      banks,
      total: banks.length,
    });
  } catch (error) {
    console.error("Error fetching banks by type:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching banks",
      error: error.message,
    });
  }
};

module.exports = {
  getAllBanks,
  getBankById,
  getBankByNumber,
  createBank,
  updateBank,
  updateBankDetails,
  deleteBank,
  getBanksByType,
};
