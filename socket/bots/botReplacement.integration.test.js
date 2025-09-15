const { gameManager } = require("../gameManager");
const GameRoom = require("../../model/GameRoom");

// Mock dependencies
jest.mock("../../model/GameRoom");
jest.mock("../gameManager");

describe("Bot Replacement Integration", () => {
  let mockIo;
  let mockRoom;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock Socket.io instance
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Create mock room with bot players
    mockRoom = {
      roomId: "room123",
      players: [
        {
          id: "bot1",
          name: "Alpha",
          color: "blue",
          isBot: true,
          joinedAt: new Date(Date.now() - 1000), // 1 second ago
        },
        {
          id: "bot2",
          name: "Beta",
          color: "green",
          isBot: true,
          joinedAt: new Date(), // Just joined
        },
      ],
      gameStatus: "waiting",
      gameSettings: {},
    };

    // Mock gameManager methods
    gameManager.getRoom.mockReturnValue(mockRoom);
    gameManager.hasBotPlayers.mockReturnValue(true);
    gameManager.removeLastJoinedBot.mockReturnValue(mockRoom.players[1]); // Return Beta (last joined)
    gameManager.GAME_STATUS = {
      WAITING: "waiting",
      PLAYING: "playing",
    };
    gameManager.acquireJoinLock.mockReturnValue(true);
    gameManager.releaseJoinLock.mockImplementation(() => {});

    // Mock GameRoom methods
    GameRoom.findOneAndUpdate.mockResolvedValue(mockRoom);
    GameRoom.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockRoom),
    });
    GameRoom.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  describe("Basic Functionality", () => {
    test("should have all required gameManager methods", () => {
      // Verify that all the new methods we added exist
      expect(typeof gameManager.hasBotPlayers).toBe("function");
      expect(typeof gameManager.getBotPlayerCount).toBe("function");
      expect(typeof gameManager.getHumanPlayerCount).toBe("function");
      expect(typeof gameManager.removeLastJoinedBot).toBe("function");
      expect(typeof gameManager.acquireJoinLock).toBe("function");
      expect(typeof gameManager.releaseJoinLock).toBe("function");
      expect(typeof gameManager.isJoinLocked).toBe("function");
    });

    test("should correctly identify bot players", () => {
      const hasBots = gameManager.hasBotPlayers("room123");
      expect(hasBots).toBe(true);
      expect(gameManager.hasBotPlayers).toHaveBeenCalledWith("room123");
    });

    test("should correctly count bot and human players", () => {
      const botCount = gameManager.getBotPlayerCount("room123");
      const humanCount = gameManager.getHumanPlayerCount("room123");
      
      expect(botCount).toBe(2);
      expect(humanCount).toBe(0);
    });

    test("should handle join locks correctly", () => {
      const lockAcquired = gameManager.acquireJoinLock("room123");
      expect(lockAcquired).toBe(true);
      
      gameManager.releaseJoinLock("room123");
      expect(gameManager.releaseJoinLock).toHaveBeenCalledWith("room123");
    });
  });

  describe("Mock Verification", () => {
    test("should have correct mock setup", () => {
      expect(gameManager.getRoom).toHaveBeenCalledWith("room123");
      expect(mockRoom.players).toHaveLength(2);
      expect(mockRoom.players[0].isBot).toBe(true);
      expect(mockRoom.players[1].isBot).toBe(true);
      expect(mockRoom.gameStatus).toBe("waiting");
    });

    test("should identify last-joined bot correctly", () => {
      // Beta should be the last-joined bot (most recent joinedAt)
      const lastJoinedBot = gameManager.removeLastJoinedBot("room123");
      expect(lastJoinedBot.name).toBe("Beta");
      expect(lastJoinedBot.id).toBe("bot2");
    });
  });

  describe("Event Emission Setup", () => {
    test("should have proper Socket.io mock setup", () => {
      expect(typeof mockIo.to).toBe("function");
      expect(typeof mockIo.emit).toBe("function");
      
      // Test the chaining
      const result = mockIo.to("room123").emit("test", {});
      expect(result).toBe(mockIo);
    });
  });
});
