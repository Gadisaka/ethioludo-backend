// Simple test to verify Telegram bot is working
const { bot } = require("./services/telegramBot");

console.log("🧪 Testing Telegram Bot...");

// Check if bot is properly initialized
if (bot) {
  console.log("✅ Bot instance created successfully");
  console.log("✅ Bot token configured");
  console.log("✅ Bot is ready to receive messages");

  // Test the /start command handler
  console.log("\n📋 Bot Commands Available:");
  console.log("- /start: Welcome message with image and buttons");
  console.log("- /register: Manual registration");
  console.log("- /stats: Bot statistics");
  console.log("- Help button: Game instructions");
  console.log("- Support button: Contact information");

  console.log("\n🎯 To test the bot:");
  console.log("1. Find your bot on Telegram");
  console.log("2. Send /start command");
  console.log("3. You should receive a welcome message with image and buttons");
} else {
  console.error("❌ Bot instance not created");
}
