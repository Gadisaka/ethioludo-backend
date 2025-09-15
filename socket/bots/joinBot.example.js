const { botJoiner } = require("./joinBot");
const { roomWatcher } = require("./roomWatcher");

/**
 * Example: Integration of BotJoiner with RoomWatcher
 * This shows how to set up automatic bot joining for eligible rooms
 */

// Example 1: Basic bot joining setup
function setupBasicBotJoining(io) {
  console.log("🤖 Setting up basic bot joining system...");

  // Start the room watcher to identify eligible rooms
  roomWatcher.start();

  // Listen for bot join pending events
  roomWatcher.on("bot_join_pending", async (data) => {
    const { roomId, maxBotsAllowed } = data;
    console.log(`🎯 Room ${roomId} ready for ${maxBotsAllowed} bots`);

    try {
      // Join the required number of bots
      const joinedBots = await botJoiner.joinMultipleBots(
        roomId,
        maxBotsAllowed,
        io
      );
      console.log(
        `✅ Successfully joined ${joinedBots.length} bots to room ${roomId}`
      );

      // Clear the pending status
      await roomWatcher.clearPendingRoom(roomId);
    } catch (error) {
      console.error(`❌ Failed to join bots to room ${roomId}:`, error);
    }
  });

  console.log("✅ Basic bot joining system ready");
}

// Example 2: Redis-enabled bot joining setup
function setupRedisBotJoining(io, redisClient) {
  console.log("🔒 Setting up Redis-enabled bot joining system...");

  // Configure bot joiner with Redis lock
  const redisBotJoiner = new BotJoiner({
    useRedisLock: true,
    redisClient: redisClient,
    botJoinDelay: 150, // Slightly longer delay for Redis operations
    logger: console,
  });

  // Start the room watcher with Redis support
  const redisRoomWatcher = new RoomWatcher({
    useRedis: true,
    redisClient: redisClient,
    logger: console,
  });

  redisRoomWatcher.start();

  // Listen for bot join pending events
  redisRoomWatcher.on("bot_join_pending", async (data) => {
    const { roomId, maxBotsAllowed } = data;
    console.log(`🎯 Redis: Room ${roomId} ready for ${maxBotsAllowed} bots`);

    try {
      // Join bots using Redis lock
      const joinedBots = await redisBotJoiner.joinMultipleBots(
        roomId,
        maxBotsAllowed,
        io
      );
      console.log(
        `✅ Redis: Successfully joined ${joinedBots.length} bots to room ${roomId}`
      );

      // Clear the pending status
      await redisRoomWatcher.clearPendingRoom(roomId);
    } catch (error) {
      console.error(`❌ Redis: Failed to join bots to room ${roomId}:`, error);
    }
  });

  console.log("✅ Redis-enabled bot joining system ready");
}

// Example 3: Manual bot joining for testing
async function manuallyJoinBots(roomId, botCount, io) {
  console.log(`🎮 Manually joining ${botCount} bots to room ${roomId}...`);

  try {
    const joinedBots = await botJoiner.joinMultipleBots(roomId, botCount, io);

    if (joinedBots.length > 0) {
      console.log(`✅ Successfully joined ${joinedBots.length} bots:`);
      joinedBots.forEach((bot, index) => {
        console.log(
          `   ${index + 1}. ${bot.name} (${bot.color}) - ${bot.avatar}`
        );
      });
    } else {
      console.log("❌ No bots were joined");
    }

    return joinedBots;
  } catch (error) {
    console.error("❌ Manual bot joining failed:", error);
    return [];
  }
}

// Example 4: Bot joining with custom configuration
function setupCustomBotJoining(io, options = {}) {
  console.log("⚙️ Setting up custom bot joining system...");

  const customBotJoiner = new BotJoiner({
    useRedisLock: options.useRedisLock || false,
    redisClient: options.redisClient || null,
    botJoinDelay: options.botJoinDelay || 200,
    logger: options.logger || console,
  });

  // Custom bot joining logic
  const customJoinLogic = async (roomId, maxBotsAllowed) => {
    console.log(`🎯 Custom: Room ${roomId} ready for ${maxBotsAllowed} bots`);

    // Add custom delay or logic here
    if (options.customDelay) {
      await new Promise((resolve) => setTimeout(resolve, options.customDelay));
    }

    try {
      const joinedBots = await customBotJoiner.joinMultipleBots(
        roomId,
        maxBotsAllowed,
        io
      );
      console.log(
        `✅ Custom: Successfully joined ${joinedBots.length} bots to room ${roomId}`
      );
      return joinedBots;
    } catch (error) {
      console.error(`❌ Custom: Failed to join bots to room ${roomId}:`, error);
      return [];
    }
  };

  return { customBotJoiner, customJoinLogic };
}

// Example 5: Monitoring and status checking
function setupBotJoiningMonitoring() {
  console.log("📊 Setting up bot joining monitoring...");

  // Monitor room watcher status
  setInterval(() => {
    const watcherStatus = roomWatcher.getStatus();
    const joinerStatus = botJoiner.getStatus();

    console.log("📊 Bot System Status:");
    console.log(
      `   Room Watcher: ${
        watcherStatus.isRunning ? "🟢 Running" : "🔴 Stopped"
      }`
    );
    console.log(`   Pending Rooms: ${watcherStatus.pendingJoinsCount}`);
    console.log(
      `   Redis Lock: ${
        joinerStatus.useRedisLock ? "🔒 Enabled" : "🔓 Disabled"
      }`
    );
    console.log(`   Bot Join Delay: ${joinerStatus.botJoinDelay}ms`);
    console.log(`   Max Players: ${joinerStatus.maxPlayers}`);
    console.log(
      `   Max Bots Per Game: ${joinerStatus.botConfig.maxBotsPerGame}`
    );
  }, 30000); // Every 30 seconds

  console.log("✅ Bot joining monitoring active");
}

// Example 6: Error handling and recovery
function setupErrorHandling() {
  console.log("🛡️ Setting up error handling and recovery...");

  // Handle uncaught errors in bot joining
  process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Unhandled Rejection in Bot System:", reason);
    console.error("Promise:", promise);
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🔄 Shutting down bot system gracefully...");

    try {
      roomWatcher.stop();
      console.log("✅ Room watcher stopped");

      // Wait for any ongoing bot joins to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("✅ Bot system shutdown complete");

      process.exit(0);
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  });

  console.log("✅ Error handling and recovery configured");
}

// Export examples for use in other files
module.exports = {
  setupBasicBotJoining,
  setupRedisBotJoining,
  manuallyJoinBots,
  setupCustomBotJoining,
  setupBotJoiningMonitoring,
  setupErrorHandling,
};

// Example usage (uncomment to run):
/*
const io = require('socket.io')(); // Your Socket.io instance

// Basic setup
setupBasicBotJoining(io);

// With monitoring
setupBotJoiningMonitoring();

// With error handling
setupErrorHandling();

// Manual bot joining (for testing)
// manuallyJoinBots('room123', 2, io);

// Redis setup (if you have Redis)
// const redis = require('redis');
// const redisClient = redis.createClient();
// setupRedisBotJoining(io, redisClient);
*/
