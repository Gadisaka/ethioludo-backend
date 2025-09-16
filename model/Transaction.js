const mongoose = require("mongoose");

const Type = {
  DEPOSIT: "DEPOSIT",
  WITHDRAW: "WITHDRAW",
  GAME_STAKE: "GAME_STAKE",
  GAME_WINNINGS: "GAME_WINNINGS",
};

const Status = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

const transactionSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  type: { type: String, enum: Object.values(Type), required: true },
  status: { type: String, enum: Object.values(Status), required: true },
  description: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  withdrawalMethod: { type: String }, // For withdrawal transactions
  accountDetails: { type: String }, // For withdrawal transactions
  // New fields for transaction verification
  externalTransactionId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values but ensures uniqueness when present
  },
  paymentProvider: {
    type: String,
    enum: ["telebirr", "cbe"],
    required: false,
  },
  verificationData: {
    referenceId: { type: String },
    receivedAmount: { type: Number },
    receiverName: { type: String },
    receiverAccountNumber: { type: String },
    payerAccountNumber: { type: String },
    verifiedAt: { type: Date, default: Date.now },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

transactionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
