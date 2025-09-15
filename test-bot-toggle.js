const { BOT_CONFIG } = require("./socket/bots/config");

console.log("=== Bot Toggle Configuration Test ===");
console.log("");

// Test 1: Check current bot configuration
console.log("1. Current Bot Configuration:");
console.log(`   - BOTS_ENABLED: ${BOT_CONFIG.BOTS_ENABLED}`);
console.log(
  `   - JOIN_DELAY_MS: ${BOT_CONFIG.JOIN_DELAY_MS}ms (${
    BOT_CONFIG.JOIN_DELAY_MS / 1000
  }s)`
);
console.log(
  `   - IMMEDIATE_JOIN_DELAY_MS: ${BOT_CONFIG.IMMEDIATE_JOIN_DELAY_MS}ms (${
    BOT_CONFIG.IMMEDIATE_JOIN_DELAY_MS / 1000
  }s)`
);
console.log(`   - MAX_BOTS_PER_GAME: ${BOT_CONFIG.MAX_BOTS_PER_GAME}`);
console.log(`   - MOVE_DELAY_MS: ${BOT_CONFIG.MOVE_DELAY_MS}ms`);
console.log(`   - DICE_ROLL_DELAY_MS: ${BOT_CONFIG.DICE_ROLL_DELAY_MS}ms`);
console.log("");

// Test 2: Environment variable simulation
console.log("2. Environment Variable Simulation:");
console.log("   To disable bots, set in your .env file:");
console.log("   BOTS_ENABLED=false");
console.log("");
console.log("   To change bot join delay, set in your .env file:");
console.log("   BOT_IMMEDIATE_JOIN_DELAY_MS=30000  # 30 seconds");
console.log("");

// Test 3: Configuration validation
console.log("3. Configuration Validation:");
if (BOT_CONFIG.BOTS_ENABLED) {
  console.log("   ✅ Bots are ENABLED - they will join games and play turns");
} else {
  console.log(
    "   ❌ Bots are DISABLED - they will not join games or play turns"
  );
}

if (BOT_CONFIG.IMMEDIATE_JOIN_DELAY_MS >= 30000) {
  console.log(
    "   ✅ Bot join delay is 30+ seconds - bots will wait before joining"
  );
} else {
  console.log(
    "   ⚠️  Bot join delay is less than 30 seconds - bots may join quickly"
  );
}

console.log("");
console.log("4. How to Use:");
console.log("   - Set BOTS_ENABLED=false in .env to completely disable bots");
console.log("   - Set BOTS_ENABLED=true (or remove the line) to enable bots");
console.log("   - Set BOT_IMMEDIATE_JOIN_DELAY_MS=30000 for 30-second delay");
console.log("   - Set BOT_IMMEDIATE_JOIN_DELAY_MS=500 for quick bot joining");
console.log("");
console.log("5. Current Status:");
console.log(
  `   Bots will ${
    BOT_CONFIG.BOTS_ENABLED
      ? "join games after " +
        BOT_CONFIG.IMMEDIATE_JOIN_DELAY_MS / 1000 +
        " seconds"
      : "NOT join games (disabled)"
  }`
);
console.log("");

console.log("=== Test Complete ===");
