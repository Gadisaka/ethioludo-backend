const mongoose = require("mongoose");

const telegramUserSchema = new mongoose.Schema(
  {
    telegramId: {
      type: Number,
      required: true,
      unique: true,
    },
    username: {
      type: String,
      default: null,
    },
    firstName: {
      type: String,
      default: null,
    },
    lastName: {
      type: String,
      default: null,
    },
    languageCode: {
      type: String,
      default: "en",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    // Track message delivery stats
    messagesReceived: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: function (v) {
          return !isNaN(v) && v >= 0;
        },
        message: "messagesReceived must be a valid number >= 0",
      },
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to ensure messagesReceived is always valid
telegramUserSchema.pre("save", function (next) {
  if (
    this.messagesReceived === undefined ||
    this.messagesReceived === null ||
    isNaN(this.messagesReceived)
  ) {
    this.messagesReceived = 0;
  }
  next();
});

// Index for efficient queries (telegramId and username already have unique/index in schema)
telegramUserSchema.index({ isActive: 1 });
telegramUserSchema.index({ joinedAt: -1 });

// Static method to get active users count
telegramUserSchema.statics.getActiveUsersCount = async function () {
  return await this.countDocuments({ isActive: true });
};

// Static method to get all active users
telegramUserSchema.statics.getActiveUsers = async function () {
  return await this.find({ isActive: true }).select(
    "telegramId username firstName lastName languageCode lastSeen joinedAt"
  );
};

// Static method to find or create user
telegramUserSchema.statics.findOrCreate = async function (userData) {
  const { telegramId, username, firstName, lastName, languageCode } = userData;

  let user = await this.findOne({ telegramId });

  if (!user) {
    user = new this({
      telegramId,
      username,
      firstName,
      lastName,
      languageCode,
    });
    await user.save();
  } else {
    // Update existing user data
    user.username = username || user.username;
    user.firstName = firstName || user.firstName;
    user.lastName = lastName || user.lastName;
    user.languageCode = languageCode || user.languageCode;
    user.lastSeen = new Date();
    await user.save();
  }

  return user;
};

// Instance method to update message stats
telegramUserSchema.methods.updateMessageStats = async function () {
  // Ensure messagesReceived is a valid number before incrementing
  this.messagesReceived = (this.messagesReceived || 0) + 1;
  this.lastMessageAt = new Date();
  this.lastSeen = new Date();
  await this.save();
};

module.exports = mongoose.model("TelegramUser", telegramUserSchema);
