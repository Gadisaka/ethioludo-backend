const mongoose = require("mongoose");

const gameSettingSchema = new mongoose.Schema(
  {
    settingKey: {
      type: String,
      required: true,
      unique: true,
      enum: [
        "GAME_CUT_PERCENTAGE",
        "BOT_DIFFICULTY",
        "MAX_PLAYERS",
        "MIN_STAKE",
        "MAX_STAKE",
        "BOTS_ENABLED",
      ],
    },
    settingValue: {
      type: mongoose.Schema.Types.Mixed, // Can store string, number, boolean, etc.
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Create indexes for better performance (unique is already handled above)
gameSettingSchema.index({ isActive: 1 });

// Static method to get a setting value
gameSettingSchema.statics.getSetting = async function (
  key,
  defaultValue = null
) {
  try {
    const setting = await this.findOne({ settingKey: key, isActive: true });
    return setting ? setting.settingValue : defaultValue;
  } catch (error) {
    console.error(`Error getting setting ${key}:`, error);
    return defaultValue;
  }
};

// Static method to update a setting
gameSettingSchema.statics.updateSetting = async function (
  key,
  value,
  updatedBy = null
) {
  try {
    const result = await this.findOneAndUpdate(
      { settingKey: key },
      {
        settingValue: value,
        lastUpdatedBy: updatedBy,
        isActive: true,
      },
      {
        upsert: true,
        new: true,
      }
    );
    return result;
  } catch (error) {
    console.error(`Error updating setting ${key}:`, error);
    throw error;
  }
};

module.exports = mongoose.model("GameSetting", gameSettingSchema);
