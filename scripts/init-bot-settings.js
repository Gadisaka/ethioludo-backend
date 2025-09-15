const mongoose = require("mongoose");
const GameSetting = require("../model/gameSetting");
require("dotenv").config();

async function initializeBotSettings() {
  try {
    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/ludo-game"
    );
    console.log("Connected to MongoDB");

    // Initialize the BOTS_ENABLED setting
    const botSetting = await GameSetting.updateSetting(
      "BOTS_ENABLED",
      false, // Default to false
      null, // No user ID for system initialization
      "Enable or disable bot players in games"
    );

    console.log("Bot settings initialized successfully:", botSetting);

    // Also initialize other bot-related settings if they don't exist
    const botDifficulty = await GameSetting.updateSetting(
      "BOT_DIFFICULTY",
      "medium",
      null,
      "Default bot difficulty level"
    );

    console.log("Bot difficulty setting:", botDifficulty);
  } catch (error) {
    console.error("Error initializing bot settings:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

// Run the script
initializeBotSettings();
