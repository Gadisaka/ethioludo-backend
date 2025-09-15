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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

transactionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
