const { Telegraf, Markup } = require("telegraf");
const path = require("path");
const axios = require("axios");
const TelegramUser = require("../model/TelegramUser");

const botToken = process.env.TELEGRAM_BOT_TOKEN;

if (!botToken) {
  console.error("❌ TELEGRAM_BOT_TOKEN environment variable is not set!");
  process.exit(1);
}

const bot = new Telegraf(botToken);

console.log(`🤖 Telegram Bot initialized with internal database calls`);
console.log(`🔑 Bot token configured: ${botToken.substring(0, 10)}...`);

// Internal broadcast function that can be used by other parts of the application
async function broadcastToTelegramUsers(message, type = "INFO") {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      throw new Error("Telegram bot token not configured");
    }

    // Get all active users from database
    const users = await TelegramUser.getActiveUsers();

    if (users.length === 0) {
      return {
        success: true,
        totalUsers: 0,
        sentCount: 0,
        failedCount: 0,
        message: "No users to broadcast to",
      };
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    // Add emoji based on message type
    const getTypeEmoji = (type) => {
      switch (type) {
        case "SUCCESS":
          return "✅";
        case "WARNING":
          return "⚠️";
        case "ERROR":
          return "❌";
        case "INFO":
        default:
          return "📢";
      }
    };

    // Preserve line breaks in the message and ensure proper formatting
    const cleanMessage = message
      .replace(/\r\n/g, "\n") // Convert Windows line breaks
      .replace(/\r/g, "\n") // Convert Mac line breaks
      .replace(/\n{3,}/g, "\n\n") // Limit to max 2 consecutive line breaks
      .trim();

    const formattedMessage = `${getTypeEmoji(
      type
    )} **${type}**\n\n${cleanMessage}`;

    // Send messages with rate limiting
    for (const user of users) {
      try {
        await axios.post(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            chat_id: user.telegramId,
            text: formattedMessage,
            parse_mode: "Markdown",
          }
        );

        // Update user's message stats
        await user.updateMessageStats();

        sentCount++;
        console.log(`📤 Message sent to ${user.username || user.telegramId}`);

        // Rate limiting: 50ms delay between messages
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (error) {
        failedCount++;
        const errorMsg = `Failed to send to ${
          user.username || user.telegramId
        }: ${error.response?.data?.description || error.message}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }

    return {
      success: true,
      totalUsers: users.length,
      sentCount,
      failedCount,
      errors: errors.slice(0, 5), // Only return first 5 errors
    };
  } catch (error) {
    console.error("Error broadcasting to Telegram users:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

// Function to register Telegram user internally
async function registerTelegramUser(ctx) {
  try {
    const user = ctx.from;
    const chatId = ctx.chat.id;

    // Use internal database call instead of HTTP request
    const userData = {
      telegramId: user.id,
      username: user.username || null,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      languageCode: user.language_code || "en",
    };

    const result = await TelegramUser.findOrCreate(userData);

    if (result) {
      console.log(
        `📱 Telegram user ${result.isNew ? "registered" : "updated"}: ${
          user.username || "Unknown"
        } (${user.id})`
      );
    } else {
      console.log(`⚠️ Failed to register user`);
    }
  } catch (error) {
    console.error(`❌ Error registering Telegram user:`, error.message);
    console.error(`❌ Full error:`, error);
  }
}

bot.start(async (ctx) => {
  try {
    console.log(
      "🚀 /start command received from user:",
      ctx.from.username || ctx.from.id
    );

    // Register user when they use /start command
    await registerTelegramUser(ctx);

    // Get user data from context
    const user = ctx.from;

    // Check if banner image exists
    const bannerPath = path.join(__dirname, "banner.jpg");
    const fs = require("fs");

    if (!fs.existsSync(bannerPath)) {
      console.log("⚠️ Banner image not found, sending text message instead");
      // Send text message with buttons if banner is missing
      await ctx.reply(
        "ሰላም  " +
          (user.first_name || "👋") +
          " 👋\n💥ወደ ኢትዮ ጌምስ እንኳን ደህና መጡ!💫🌟\n\n🎮 ይጫወቱ, ይዝናኑ, ያሸንፉ 🎲\n\n🎲 ሉዶ 🎲   🎰 ቢንጎ 🎰\n🎯 ዳማ 🎯   ♟ ቼስ ♟\n🃏 ላጥላጥ 🃏 🧮 ኬኖ 🧮\n\n👇 🔥 ለመጫወት ከስር ያለውን በተን ይጫኑ 💸 👇\n\n",
        {
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.webApp(
                "🎮 አሁኑኑ ይጫወቱ",
                "https://games.ethiobingo.net"
              ),
            ],
            [Markup.button.url("📢 ቻናል ይቀላቀሉ", "https://t.me/ethioludoking")],
            [
              Markup.button.callback("ℹ️ Help", "help"),
              Markup.button.callback("📞 Support", "support"),
            ],
          ]).reply_markup,
        }
      );
    } else {
      console.log("✅ Banner image found, sending photo with message");
      // ✅ Send everything as one message with photo and buttons
      await ctx.replyWithPhoto(
        {
          source: bannerPath,
        },
        {
          caption:
            "ሰላም  " +
            (user.first_name || "👋") +
            " 👋\n💥ወደ ኢትዮ ጌምስ እንኳን ደህና መጡ!💫🌟\n\n🎮 ይጫወቱ, ይዝናኑ, ያሸንፉ 🎲\n\n🎲 ሉዶ 🎲   🎰 ቢንጎ 🎰\n🎯 ዳማ 🎯   ♟ ቼስ ♟\n🃏 ላጥላጥ 🃏 🧮 ኬኖ 🧮\n\n👇 🔥 ለመጫወት ከስር ያለውን በተን ይጫኑ 💸 👇\n\n",
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.webApp(
                "🎮 አሁኑኑ ይጫወቱ",
                "https://games.ethiobingo.net"
              ),
            ],
            //buttons for games [ludo, bingo, latlat, dama, kano, chess]
            [
              Markup.button.webApp("🎲 ሉዶ", "https://play.ludo.ethiobingo.net"),
              Markup.button.webApp(
                "🎰 ቢንጎ (soon)",
                "https://games.ethiobingo.net"
              ),
            ],
            [
              Markup.button.webApp(
                "♟ ቼስ (soon)",
                "https://games.ethiobingo.net"
              ),
              Markup.button.webApp(
                "🎯 ዳማ (soon)",
                "https://games.ethiobingo.net"
              ),
            ],
            [
              Markup.button.webApp(
                "🃏 ላጥላጥ (soon)",
                "https://games.ethiobingo.net"
              ),
              Markup.button.webApp(
                "🧮 ኬኖ (soon)",
                "https://games.ethiobingo.net"
              ),
            ],

            [Markup.button.url("📢 ቻናል ይቀላቀሉ", "https://t.me/ethiogamess_bot")],
            [
              Markup.button.callback("ℹ️ Help", "help"),
              Markup.button.callback("📞 Support", "support"),
            ],
          ]).reply_markup,
        }
      );
    }

    console.log(
      "✅ Welcome message sent successfully to user:",
      user.username || user.id
    );
  } catch (error) {
    console.error("❌ Error in /start command:", error);
    await ctx.reply("❌ Sorry, there was an error. Please try again later.");
  }
});

// Handle callback buttons
bot.action("help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "🆘 **Help & Instructions**\n\n" +
      "🎮 **How to Play:**\n" +
      "1. Tap '🎮 አሁኑኑ ይጫወቱ' to start\n" +
      //deposit money
      "2. Choose a game you want to play\n" +
      "3. Deposit money to your account\n" +
      //withdraw money
      "4. start enjoying your game\n" +
      "5. Play strategically to win!\n\n" +
      "Need more help? Contact support!",
    { parse_mode: "Markdown" }
  );
});

bot.action("support", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    "📞 **Contact Support**\n\n" +
      "Having issues? We're here to help!\n\n" +
      "💬 Telegram: @ethiopiangames\n" +
      "We'll get back to you within 24 hours!",
    { parse_mode: "Markdown" }
  );
});

// Manual registration command
bot.command("register", async (ctx) => {
  await registerTelegramUser(ctx);
  await ctx.reply(
    "✅ **Registration Status**\n\n" +
      "You have been registered for notifications!\n\n" +
      "You'll receive updates about:\n" +
      "• Game announcements\n" +
      "• System maintenance\n" +
      "• Special events\n" +
      "• Security alerts\n\n" +
      "🎮 Ready to play?",
    {
      parse_mode: "Markdown",
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.webApp("🎮 Play Game", "https://games.ethiobingo.net")],
      ]).reply_markup,
    }
  );
});

// Stats command for admins
bot.command("stats", async (ctx) => {
  try {
    // Use internal database calls instead of HTTP requests
    const totalUsers = await TelegramUser.getActiveUsersCount();

    // Calculate total messages sent across all users
    const totalMessagesSent = await TelegramUser.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: "$messagesReceived" } } },
    ]);

    await ctx.reply(
      `📊 **Bot Statistics**\n\n` +
        `👥 Total Users: ${totalUsers}\n` +
        `📨 Total Messages Sent: ${totalMessagesSent[0]?.total || 0}\n` +
        `📱 Registered for notifications\n\n` +
        `Use /start to register if you haven't already!`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    console.error("❌ Error getting stats:", error.message);
    await ctx.reply("❌ Error getting statistics");
  }
});

// Add error handling for bot launch
bot.launch().catch((error) => {
  console.error("❌ Failed to launch Telegram bot:", error);
  process.exit(1);
});

// Add graceful shutdown
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("✅ Telegram bot started!");

// Export both the bot instance and the broadcast function
module.exports = {
  bot,
  broadcastToTelegramUsers,
};
