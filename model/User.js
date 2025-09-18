const mongoose = require("mongoose");

const Role = {
  ADMIN: "ADMIN",
  PLAYER: "PLAYER",
};

const userSchema = new mongoose.Schema({
  // Telegram authentication fields
  telegram_id: { type: Number, unique: true, sparse: true }, // Made optional and sparse for legacy users
  username: { type: String, required: true },
  first_name: { type: String },
  last_name: { type: String },
  phone_number: { type: String }, // Optional, collected via Telegram Mini App

  // Legacy fields (deprecated but kept for compatibility)
  phone: { type: String, unique: true, sparse: true }, // Made optional and sparse
  password: { type: String }, // Made optional for Telegram users

  role: { type: String, enum: Object.values(Role), default: Role.PLAYER },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet" },
  transactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Transaction" }],
  hostedGames: [{ type: mongoose.Schema.Types.ObjectId, ref: "GameRoom" }],
});

userSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("User", userSchema);
