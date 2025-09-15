const { botController } = require("./socket/bots/controller");
const { gameManager } = require("./socket/gameManager");

// Mock Socket.io
const mockIo = {
  to: function () {
    return this;
  },
  emit: function () {
    return this;
  },
};

// Test the bot controller
async function testBotController() {
  console.log("Testing Bot Controller...");

  // Initialize bot controller
  botController.initialize(mockIo);
  console.log("Bot controller initialized:", !!botController.io);

  // Create a test room
  const roomId = "test-room-123";
  const testRoom = {
    roomId,
    players: [
      {
        id: "human1",
        name: "Human Player",
        color: "green",
        isBot: false,
      },
      {
        id: "bot1",
        name: "Test Bot",
        color: "blue",
        isBot: true,
        difficulty: "medium",
      },
    ],
    currentTurn: "human1",
    gameStatus: "playing",
    lastRoll: null,
  };

  // Add room to game manager
  gameManager.rooms.set(roomId, testRoom);

  // Test turn change to bot
  console.log("\nTesting turn change to bot...");
  console.log("Current turn before:", testRoom.currentTurn);

  // Change turn to bot
  testRoom.currentTurn = "bot1";
  console.log("Current turn after change:", testRoom.currentTurn);

  // Call bot controller
  console.log("\nCalling bot controller handleTurnChange...");
  botController.handleTurnChange(roomId, "bot1");

  // Wait a bit to see if the bot turn is scheduled
  setTimeout(() => {
    console.log("\nChecking bot timers after 1 second...");
    const status = botController.getStatus();
    console.log("Bot controller status:", status);

    // Check if bot turn was scheduled
    const roomTimers = botController.botTimers.get(roomId);
    if (roomTimers && roomTimers.size > 0) {
      console.log("Bot turn was scheduled successfully!");
      console.log("Active timers:", Array.from(roomTimers.keys()));
    } else {
      console.log("No bot turn was scheduled!");
    }

    // Clean up
    gameManager.deleteRoom(roomId);
    console.log("Test completed.");
  }, 1000);
}

// Run the test
testBotController().catch(console.error);
