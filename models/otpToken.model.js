const mongoose = require("mongoose");

const otpTokenSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, index: true },
    code: { type: String, required: true },
    purpose: { type: String, enum: ["signup", "login"], default: "signup" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index to auto-delete after expiry
otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpToken", otpTokenSchema);
