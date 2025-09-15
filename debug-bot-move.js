console.log("Loading modules...");

let BotController, GameManager;

try {
  const controllerModule = require("./socket/bots/controller");
  BotController = controllerModule.BotController;
  console.log("BotController loaded successfully");
} catch (error) {
  console.error("Error loading BotController:", error);
  process.exit(1);
}

try {
  const gameManagerModule = require("./socket/gameManager");
  GameManager = gameManagerModule.GameManager;
  console.log("GameManager loaded successfully");
} catch (error) {
  console.error("Error loading GameManager:", error);
  process.exit(1);
}

// Mock socket.io
const mockIO = {
  to: () => ({
    emit: () => {},
  }),
};

// Mock logger
const mockLogger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
};

// Create bot controller instance
const botController = new BotController({ io: mockIO, logger: mockLogger });

// Create a simple test room
const testRoom = {
  id: "test-room",
  players: [
    {
      id: "bot-1",
      name: "TestBot",
      color: "green",
      isBot: true,
      difficulty: "medium",
    },
    { id: "human-1", name: "TestHuman", color: "red", isBot: false },
  ],
  currentTurn: "bot-1",
  gameStatus: "PLAYING",
  lastRoll: { value: 6, roller: "bot-1", moved: false },
  gameSettings: { requiredPieces: 4 },
};

// Create test game state
const testGameState = {
  pieces: {
    green: ["gh1", "gh2", "gh3", "gh4"], // All pieces in home
    red: ["rh1", "rh2", "rh3", "rh4"], // All pieces in home
  },
};

// Mock gameManager
const mockGameManager = {
  getRoom: (roomId) => testRoom,
  getGameState: (roomId) => testGameState,
};

// Replace the gameManager reference in botController
botController.gameManager = mockGameManager;

console.log("=== Testing Bot Move Logic ===");
console.log("Room:", testRoom);
console.log("Game State:", testGameState);

// Test 1: Evaluate legal moves
console.log("\n--- Test 1: Evaluate Legal Moves ---");
const legalMoves = botController.evaluateLegalMoves("test-room", "green", 6);
console.log("Legal moves found:", legalMoves.length);
console.log("Legal moves:", legalMoves);

// Test 2: Select best move
console.log("\n--- Test 2: Select Best Move ---");
const selectedMove = botController.selectBestMove(
  legalMoves,
  "medium",
  "test-room",
  "green"
);
console.log("Selected move:", selectedMove);

// Test 3: Make bot move
console.log("\n--- Test 3: Make Bot Move ---");
botController
  .makeBotMove("test-room", "bot-1", 6)
  .then((result) => {
    console.log("Move result:", result);
  })
  .catch((error) => {
    console.error("Move error:", error);
  });
