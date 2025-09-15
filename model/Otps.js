const mongoose = require("mongoose");

const OtpPurpose = {
  signup: "signup",
  withdraw: "withdraw",
};

const otpsSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  code: { type: String, required: true },
  purpose: { type: String, enum: Object.values(OtpPurpose), required: true },
  isUsed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Otps", otpsSchema);
