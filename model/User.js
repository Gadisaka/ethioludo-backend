const mongoose = require("mongoose");

const Role = {
  ADMIN: "ADMIN",
  PLAYER: "PLAYER",
};

const userSchema = new mongoose.Schema({
  phone: { type: String, unique: true, required: true },
  username: { type: String, required: true },
  password: { type: String, required: true },
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
