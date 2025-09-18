const mongoose = require("mongoose");
const User = require("../model/User");
require("dotenv").config();

const migrateToTelegramAuth = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Get all existing users
    const existingUsers = await User.find({});
    console.log(`Found ${existingUsers.length} existing users`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of existingUsers) {
      try {
        // Check if user already has telegram_id (already migrated)
        if (user.telegram_id) {
          console.log(
            `User ${user.username} already has telegram_id, skipping`
          );
          skippedCount++;
          continue;
        }

        // For existing users without telegram_id, we need to handle them differently
        // Since we can't generate a real telegram_id, we'll mark them as legacy users
        // and they'll need to re-register through Telegram

        // Option 1: Keep existing users but mark them as legacy
        // This allows them to continue using the old auth system temporarily
        user.isLegacyUser = true;

        // Use updateOne to avoid validation issues
        await User.updateOne(
          { _id: user._id },
          { $set: { isLegacyUser: true } }
        );

        console.log(`Marked user ${user.username} as legacy user`);
        migratedCount++;

        // Option 2: If you want to completely remove old users (uncomment below)
        // await User.deleteOne({ _id: user._id });
        // console.log(`Deleted legacy user ${user.username}`);
        // migratedCount++;
      } catch (error) {
        console.error(`Error processing user ${user.username}:`, error);
      }
    }

    console.log(`\nMigration completed:`);
    console.log(`- Migrated: ${migratedCount} users`);
    console.log(`- Skipped: ${skippedCount} users`);
    console.log(`- Total processed: ${existingUsers.length} users`);

    // Create a sample Telegram user for testing (optional)
    const testTelegramUser = await User.findOne({ telegram_id: 123456789 });
    if (!testTelegramUser) {
      const newUser = new User({
        telegram_id: 123456789,
        username: "test_telegram_user",
        first_name: "Test",
        last_name: "User",
        phone_number: "+1234567890",
        role: "PLAYER",
      });
      await newUser.save();
      console.log("Created test Telegram user for development");
    }
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
};

// Run migration if this script is executed directly
if (require.main === module) {
  migrateToTelegramAuth()
    .then(() => {
      console.log("Migration script completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration script failed:", error);
      process.exit(1);
    });
}

module.exports = migrateToTelegramAuth;
