const mongoose = require("mongoose");
const GameSetting = require("../model/gameSetting");
require("dotenv").config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

const initializeGameSettings = async () => {
  try {
    console.log("🚀 Initializing game settings...");

    const defaultSettings = [
      {
        settingKey: "GAME_CUT_PERCENTAGE",
        settingValue: 10,
        description: "Percentage cut taken from game winnings",
      },
      {
        settingKey: "BOT_DIFFICULTY",
        settingValue: "medium",
        description: "Default bot difficulty level",
      },
      {
        settingKey: "MAX_PLAYERS",
        settingValue: 4,
        description: "Maximum players allowed in a game",
      },
      {
        settingKey: "MIN_STAKE",
        settingValue: 10,
        description: "Minimum stake amount for games",
      },
      {
        settingKey: "MAX_STAKE",
        settingValue: 1000,
        description: "Maximum stake amount for games",
      },
    ];

    let createdCount = 0;
    let existingCount = 0;

    for (const settingData of defaultSettings) {
      try {
        const existingSetting = await GameSetting.findOne({
          settingKey: settingData.settingKey,
        });

        if (!existingSetting) {
          await GameSetting.create(settingData);
          console.log(
            `✅ Created setting: ${settingData.settingKey} = ${settingData.settingValue}`
          );
          createdCount++;
        } else {
          console.log(
            `ℹ️  Setting already exists: ${settingData.settingKey} = ${existingSetting.settingValue}`
          );
          existingCount++;
        }
      } catch (error) {
        console.error(
          `❌ Error creating setting ${settingData.settingKey}:`,
          error.message
        );
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Created: ${createdCount} settings`);
    console.log(`   Existing: ${existingCount} settings`);
    console.log(`   Total: ${createdCount + existingCount} settings`);
  } catch (error) {
    console.error("❌ Error initializing game settings:", error);
  }
};

const main = async () => {
  await connectDB();
  await initializeGameSettings();

  console.log("\n🎉 Game settings initialization complete!");
  process.exit(0);
};

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
}

module.exports = { initializeGameSettings };
