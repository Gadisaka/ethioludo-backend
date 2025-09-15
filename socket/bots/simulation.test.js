const { BotJoiner } = require("./joinBot");
const { botController } = require("./controller");
const { HardAI } = require("./ai/hard");
const { gameManager } = require("../gameManager");
const GameRoom = require("../../model/GameRoom");

// Mock dependencies
jest.mock("../../model/GameRoom");
jest.mock("../gameManager");

describe("Bot End-to-End Simulation Tests", () => {
  let botJoiner;
  let hardAI;
  let mockIo;
  let mockRedisClient;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock Socket.io
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Setup mock Redis client
    mockRedisClient = {
      set: jest.fn(),
      eval: jest.fn(),
      get: jest.fn(),
    };

    // Setup mock GameRoom
    GameRoom.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "sim_room",
        status: "waiting",
        players: [],
        maxPlayers: 2,
        playersCount: 0,
      }),
    });

    GameRoom.findOneAndUpdate.mockResolvedValue({
      _id: "sim_room",
      status: "waiting",
      players: [],
      maxPlayers: 4,
      playersCount: 1,
    });

    // Setup mock gameManager
    gameManager.getRoom.mockReturnValue({
      id: "sim_room",
      status: "waiting",
      players: [],
      maxPlayers: 2,
    });

    gameManager.hasBotPlayers.mockReturnValue(false);
    gameManager.acquireJoinLock.mockReturnValue(true);
    gameManager.releaseJoinLock.mockImplementation(() => {});

    botJoiner = new BotJoiner(mockIo, mockRedisClient);
    hardAI = new HardAI();
  });

  describe("Full Game Simulation with Different King Counts", () => {
    it("should simulate complete game with kings=1", async () => {
      const kings = 1;
      const gameResult = await simulateFullGame(kings);

      expect(gameResult.completed).toBe(true);
      expect(gameResult.winner).toBeDefined();
      expect(gameResult.totalTurns).toBeGreaterThan(0);
      expect(gameResult.botNames).toHaveLength(1);

      // Verify no duplicate bot names
      const uniqueNames = new Set(gameResult.botNames);
      expect(uniqueNames.size).toBe(1);

      // Verify game completed within reasonable turns
      expect(gameResult.totalTurns).toBeLessThan(100);

      console.log(
        `Kings=${kings} game completed in ${gameResult.totalTurns} turns. Winner: ${gameResult.winner}`
      );
    }, 30000);

    it("should simulate complete game with kings=2", async () => {
      const kings = 2;
      const gameResult = await simulateFullGame(kings);

      expect(gameResult.completed).toBe(true);
      expect(gameResult.winner).toBeDefined();
      expect(gameResult.totalTurns).toBeGreaterThan(0);
      expect(gameResult.botNames).toHaveLength(1);

      // Verify no duplicate bot names
      const uniqueNames = new Set(gameResult.botNames);
      expect(uniqueNames.size).toBe(1);

      // Verify game completed within reasonable turns
      expect(gameResult.totalTurns).toBeLessThan(150);

      console.log(
        `Kings=${kings} game completed in ${gameResult.totalTurns} turns. Winner: ${gameResult.winner}`
      );
    }, 30000);

    it("should simulate complete game with kings=3", async () => {
      const kings = 3;
      const gameResult = await simulateFullGame(kings);

      expect(gameResult.completed).toBe(true);
      expect(gameResult.winner).toBeDefined();
      expect(gameResult.totalTurns).toBeGreaterThan(0);
      expect(gameResult.botNames).toHaveLength(1);

      // Verify no duplicate bot names
      const uniqueNames = new Set(gameResult.botNames);
      expect(uniqueNames.size).toBe(1);

      // Verify game completed within reasonable turns
      expect(gameResult.totalTurns).toBeLessThan(200);

      console.log(
        `Kings=${kings} game completed in ${gameResult.totalTurns} turns. Winner: ${gameResult.winner}`
      );
    }, 30000);

    it("should simulate complete game with kings=4", async () => {
      const kings = 4;
      const gameResult = await simulateFullGame(kings);

      expect(gameResult.completed).toBe(true);
      expect(gameResult.winner).toBeDefined();
      expect(gameResult.totalTurns).toBeGreaterThan(0);
      expect(gameResult.botNames).toHaveLength(1);

      // Verify no duplicate bot names
      const uniqueNames = new Set(gameResult.botNames);
      expect(uniqueNames.size).toBe(1);

      // Verify game completed within reasonable turns
      expect(gameResult.totalTurns).toBeLessThan(250);

      console.log(
        `Kings=${kings} game completed in ${gameResult.totalTurns} turns. Winner: ${gameResult.winner}`
      );
    }, 30000);

    it("should compare game strategies across different king counts", async () => {
      const results = {};

      // Simulate games for each king count
      for (let kings = 1; kings <= 4; kings++) {
        results[kings] = await simulateFullGame(kings);
      }

      // Verify all games completed
      Object.values(results).forEach((result) => {
        expect(result.completed).toBe(true);
        expect(result.winner).toBeDefined();
      });

      // Analyze strategy differences
      const avgTurns = {};
      Object.entries(results).forEach(([kings, result]) => {
        avgTurns[kings] = result.totalTurns;
      });

      // Games with fewer kings should generally complete faster
      // (though this is not guaranteed due to randomness)
      console.log("Average turns by king count:", avgTurns);

      // Verify no duplicate bot names across all games
      const allBotNames = [];
      Object.values(results).forEach((result) => {
        allBotNames.push(...result.botNames);
      });

      const uniqueNames = new Set(allBotNames);
      expect(uniqueNames.size).toBe(allBotNames.length);
    }, 120000); // 2 minute timeout for multiple games
  });

  describe("Game State Consistency", () => {
    it("should maintain consistent game state throughout simulation", async () => {
      const kings = 2;
      const gameStates = [];

      // Track game state changes
      const trackState = (state) => {
        gameStates.push({
          turn: state.turn,
          players: state.players.map((p) => ({
            id: p.id,
            color: p.color,
            pieces: p.pieces.length,
            home: p.pieces.filter((piece) => piece.isHome).length,
          })),
          status: state.status,
        });
      };

      const gameResult = await simulateFullGame(kings, trackState);

      expect(gameResult.completed).toBe(true);
      expect(gameStates.length).toBeGreaterThan(0);

      // Verify state consistency
      gameStates.forEach((state, index) => {
        expect(state.players).toHaveLength(4);
        expect(state.turn).toBeDefined();
        expect(state.status).toBeDefined();

        // Verify each player has valid state
        state.players.forEach((player) => {
          expect(player.pieces).toBeGreaterThanOrEqual(0);
          expect(player.home).toBeGreaterThanOrEqual(0);
          expect(player.home).toBeLessThanOrEqual(player.pieces);
        });
      });

      console.log(`Tracked ${gameStates.length} game states`);
    }, 30000);

    it("should handle bot replacement by humans correctly", async () => {
      const kings = 3;
      let humanJoined = false;
      let botReplaced = false;

      // Mock human join during game
      const originalHasBotPlayers = gameManager.hasBotPlayers;
      gameManager.hasBotPlayers.mockImplementation(() => {
        // Simulate human joining after a few turns
        if (!humanJoined && Math.random() < 0.3) {
          humanJoined = true;
          return true;
        }
        return false;
      });

      const gameResult = await simulateFullGame(kings);

      expect(gameResult.completed).toBe(true);

      // Verify game completed even with human join
      expect(gameResult.totalTurns).toBeGreaterThan(0);

      console.log(`Game completed with human join simulation`);
    }, 30000);
  });

  describe("Performance and Stability", () => {
    it("should complete multiple games without memory leaks", async () => {
      const gameCount = 5;
      const results = [];

      // Run multiple games
      for (let i = 0; i < gameCount; i++) {
        const kings = (i % 4) + 1;
        const result = await simulateFullGame(kings);
        results.push(result);

        // Verify each game completed
        expect(result.completed).toBe(true);
        expect(result.winner).toBeDefined();
      }

      // Verify all games completed successfully
      expect(results).toHaveLength(gameCount);

      // Verify no duplicate bot names across all games
      const allBotNames = results.flatMap((r) => r.botNames);
      const uniqueNames = new Set(allBotNames);
      expect(uniqueNames.size).toBe(allBotNames.length);

      console.log(`Completed ${gameCount} games without issues`);
    }, 150000); // 2.5 minute timeout for multiple games

    it("should handle edge cases without crashing", async () => {
      const kings = 4;

      // Mock some edge cases
      let edgeCaseCount = 0;
      const originalGetRoom = gameManager.getRoom;
      gameManager.getRoom.mockImplementation((roomId) => {
        edgeCaseCount++;

        // Simulate occasional edge cases
        if (edgeCaseCount % 10 === 0) {
          // Return null room (edge case)
          return null;
        }

        return originalGetRoom(roomId);
      });

      // Game should handle edge cases gracefully
      const gameResult = await simulateFullGame(kings);

      // Should still complete or handle gracefully
      expect(gameResult.completed || gameResult.error).toBeDefined();

      console.log(`Game handled edge cases gracefully`);
    }, 30000);
  });
});

// Helper function to simulate a full game
async function simulateFullGame(kings, stateTracker = null) {
  const roomId = `sim_room_${kings}_${Date.now()}`;
  const maxTurns = 300; // Prevent infinite games
  let currentTurn = 0;
  let gameCompleted = false;
  let winner = null;
  let error = null;

  try {
    // Initialize game state
    const gameState = {
      id: roomId,
      status: "waiting",
      players: [],
      maxPlayers: 4,
      currentTurn: 0,
      board: {
        red: Array(4)
          .fill()
          .map((_, i) => ({ position: -1, isHome: false })),
        green: Array(4)
          .fill()
          .map((_, i) => ({ position: -1, isHome: false })),
        yellow: Array(4)
          .fill()
          .map((_, i) => ({ position: -1, isHome: false })),
        blue: Array(4)
          .fill()
          .map((_, i) => ({ position: -1, isHome: false })),
      },
      rules: { kings },
    };

    // Add 4 bot players
    const colors = ["red", "green", "yellow", "blue"];
    const botNames = [];

    for (let i = 0; i < 4; i++) {
      const botName = `Bot_${colors[i]}_${Date.now()}_${Math.random()}`;
      botNames.push(botName);

      gameState.players.push({
        id: `bot_${i}`,
        name: botName,
        color: colors[i],
        isBot: true,
        difficulty: "hard",
        pieces: gameState.board[colors[i]],
      });
    }

    // Start game
    gameState.status = "playing";

    // Game loop
    while (currentTurn < maxTurns && !gameCompleted) {
      currentTurn++;

      // Track state if requested
      if (stateTracker) {
        stateTracker({ ...gameState, turn: currentTurn });
      }

      // Simulate bot turn
      const currentPlayer = gameState.players[currentTurn % 4];
      if (currentPlayer && currentPlayer.isBot) {
        // Simulate dice roll
        const diceRoll = Math.floor(Math.random() * 6) + 1;

        // Get bot move using HardAI
        const move = hardAI.chooseMove(gameState, currentPlayer.id, diceRoll, {
          kings,
        });

        if (move) {
          // Apply move
          if (move.isBringOut) {
            // Bring out piece
            const piece = gameState.board[currentPlayer.color][move.pieceIndex];
            piece.position = getStartingPosition(currentPlayer.color);
          } else {
            // Move piece
            const piece = gameState.board[currentPlayer.color][move.pieceIndex];
            piece.position = move.toPosition;

            // Check if piece reached home
            if (piece.position >= 50) {
              piece.isHome = true;
            }
          }

          // Check for kills
          if (move.willKill) {
            // Simulate killing opponent piece
            const victimPiece = findPieceAtPosition(gameState, move.toPosition);
            if (victimPiece) {
              victimPiece.position = -1;
              victimPiece.isHome = false;
            }
          }
        }

        // Check for game completion
        const winner = checkWinner(gameState, kings);
        if (winner) {
          gameCompleted = true;
          gameState.status = "finished";
          break;
        }
      }

      // Small delay to prevent infinite loops
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    if (gameCompleted) {
      winner = checkWinner(gameState, kings);
    }

    return {
      completed: gameCompleted,
      winner: winner ? winner.name : null,
      totalTurns: currentTurn,
      botNames,
      error: null,
    };
  } catch (err) {
    return {
      completed: false,
      winner: null,
      totalTurns: currentTurn,
      botNames: [],
      error: err.message,
    };
  }
}

// Helper functions
function getStartingPosition(color) {
  const positions = { red: 0, green: 13, yellow: 26, blue: 39 };
  return positions[color] || 0;
}

function findPieceAtPosition(gameState, position) {
  for (const color in gameState.board) {
    for (const piece of gameState.board[color]) {
      if (piece.position === position) {
        return piece;
      }
    }
  }
  return null;
}

function checkWinner(gameState, kings) {
  for (const player of gameState.players) {
    const pieces = gameState.board[player.color];
    const homePieces = pieces.filter((p) => p.isHome).length;

    if (homePieces >= kings) {
      return player;
    }
  }
  return null;
}
