const { BotJoiner, botJoiner } = require("./joinBot");
const { generateUniqueBotName } = require("./config");
const GameRoom = require("../../model/GameRoom");
const { gameManager } = require("../gameManager");

// Mock dependencies
jest.mock("../../model/GameRoom");
jest.mock("../gameManager");
jest.mock("./config", () => ({
  generateUniqueBotName: jest.fn(),
  getBotConfig: jest.fn(() => ({
    MAX_BOTS_PER_GAME: 3,
    AVAILABLE_COLORS: ["green", "blue"],
    DIFFICULTY_LEVELS: {
      EASY: "easy",
      MEDIUM: "medium",
      HARD: "hard",
    },
  })),
}));

describe("BotJoiner", () => {
  let botJoinerInstance;
  let mockIo;
  let mockRedisClient;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock Socket.io instance
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    // Create mock Redis client
    mockRedisClient = {
      set: jest.fn(),
      eval: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };

    // Create fresh instance for each test
    botJoinerInstance = new BotJoiner({
      useRedisLock: false,
      logger: console,
    });

    // Mock GameRoom methods
    GameRoom.findOne = jest.fn();
    GameRoom.findOneAndUpdate = jest.fn();
    GameRoom.updateOne = jest.fn();
  });

  // Helper function to setup GameRoom mocks
  const setupGameRoomMocks = (mockRoom) => {
    GameRoom.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockRoom),
    });
    GameRoom.findOneAndUpdate.mockResolvedValue(mockRoom);
    GameRoom.updateOne.mockResolvedValue({});
  };

  // Mock gameManager
  gameManager.getRoom = jest.fn();
  gameManager.GAME_STATUS = {
    WAITING: "waiting",
    PLAYING: "playing",
  };

  describe("Constructor", () => {
    test("should initialize with default options", () => {
      const joiner = new BotJoiner();
      expect(joiner.useRedisLock).toBe(false);
      expect(joiner.redisClient).toBeNull();
      expect(joiner.botJoinDelay).toBe(100);
    });

    test("should initialize with custom options", () => {
      const joiner = new BotJoiner({
        useRedisLock: true,
        redisClient: mockRedisClient,
        botJoinDelay: 200,
        logger: console,
      });
      expect(joiner.useRedisLock).toBe(true);
      expect(joiner.redisClient).toBe(mockRedisClient);
      expect(joiner.botJoinDelay).toBe(200);
    });
  });

  describe("joinBot", () => {
    test("should join bot using atomic update when Redis lock is disabled", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue({
        players: mockRoom.players,
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName.mockReturnValue("Alpha");

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeDefined();
      expect(result.name).toBe("Alpha");
      expect(result.isBot).toBe(true);
      expect(GameRoom.findOneAndUpdate).toHaveBeenCalledWith(
        {
          roomId,
          gameStatus: "waiting",
          $expr: { $lt: [{ $size: "$players" }, 4] },
        },
        expect.any(Object),
        expect.any(Object)
      );
    });

    test("should return null when room is not eligible", async () => {
      const roomId = "room123";
      GameRoom.findOneAndUpdate.mockResolvedValue(null);

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });

    test("should handle errors gracefully", async () => {
      const roomId = "room123";
      GameRoom.findOneAndUpdate.mockRejectedValue(new Error("Database error"));

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });
  });

  describe("joinBotWithRedisLock", () => {
    beforeEach(() => {
      botJoinerInstance.useRedisLock = true;
      botJoinerInstance.redisClient = mockRedisClient;
    });

    test("should join bot using Redis lock when available", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      mockRedisClient.set.mockResolvedValue("OK");
      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue({
        players: mockRoom.players,
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName.mockReturnValue("Beta");
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeDefined();
      expect(result.name).toBe("Beta");
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `bot_join_lock:${roomId}`,
        expect.stringMatching(/bot_join_\d+_[a-z0-9]+/),
        "PX",
        10000,
        "NX"
      );
    });

    test("should return null when Redis lock cannot be acquired", async () => {
      const roomId = "room123";
      mockRedisClient.set.mockResolvedValue(null);

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });

    test("should release lock on error", async () => {
      const roomId = "room123";
      mockRedisClient.set.mockResolvedValue("OK");
      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("Database error")),
      });
      mockRedisClient.eval.mockResolvedValue(1);

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
      expect(mockRedisClient.eval).toHaveBeenCalled();
    });
  });

  describe("joinMultipleBots", () => {
    test("should join multiple bots sequentially with delays", async () => {
      const roomId = "room123";
      const botCount = 3;
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue({
        players: mockRoom.players,
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName
        .mockReturnValueOnce("Alpha")
        .mockReturnValueOnce("Beta")
        .mockReturnValueOnce("Gamma");

      const startTime = Date.now();
      const result = await botJoinerInstance.joinMultipleBots(
        roomId,
        botCount,
        mockIo
      );
      const endTime = Date.now();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Alpha");
      expect(result[1].name).toBe("Beta");
      expect(result[2].name).toBe("Gamma");

      // Should take at least (botCount - 1) * delay milliseconds
      const minExpectedTime = (botCount - 1) * botJoinerInstance.botJoinDelay;
      expect(endTime - startTime).toBeGreaterThanOrEqual(minExpectedTime);
    });

    test("should stop joining when a bot fails", async () => {
      const roomId = "room123";
      const botCount = 3;

      // First bot succeeds, second fails
      GameRoom.findOneAndUpdate
        .mockResolvedValueOnce({ roomId, players: [], gameStatus: "waiting" })
        .mockResolvedValueOnce(null);
      setupGameRoomMocks({
        roomId,
        players: [],
        gameStatus: "waiting",
      });
      gameManager.getRoom.mockReturnValue({
        players: [],
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName.mockReturnValue("Alpha");

      const result = await botJoinerInstance.joinMultipleBots(
        roomId,
        botCount,
        mockIo
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Alpha");
    });
  });

  describe("verifyRoomEligibility", () => {
    test("should return eligible when room meets criteria", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1" }],
        gameStatus: "waiting",
      };

      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockRoom),
      });

      const result = await botJoinerInstance.verifyRoomEligibility(roomId);

      expect(result.canJoin).toBe(true);
      expect(result.reason).toBe("Room eligible");
    });

    test("should return not eligible when room is full", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: Array(4).fill({ id: "player", name: "Player" }),
        gameStatus: "waiting",
      };

      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockRoom),
      });

      const result = await botJoinerInstance.verifyRoomEligibility(roomId);

      expect(result.canJoin).toBe(false);
      expect(result.reason).toBe("Room is full");
    });

    test("should return not eligible when game status is not waiting", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1" }],
        gameStatus: "playing",
      };

      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockRoom),
      });

      const result = await botJoinerInstance.verifyRoomEligibility(roomId);

      expect(result.canJoin).toBe(false);
      expect(result.reason).toBe("Game not in waiting status");
    });

    test("should return not eligible when room not found", async () => {
      const roomId = "room123";
      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      const result = await botJoinerInstance.verifyRoomEligibility(roomId);

      expect(result.canJoin).toBe(false);
      expect(result.reason).toBe("Room not found");
    });
  });

  describe("createBotPlayer", () => {
    test("should create bot with unique name and available color", () => {
      const existingPlayers = [
        { name: "Player1", color: "red" },
        { name: "Alpha", color: "green", isBot: true },
      ];
      const existingBotNames = ["Alpha"];

      generateUniqueBotName.mockReturnValue("Beta");

      const bot = botJoinerInstance.createBotPlayer(
        existingPlayers,
        existingBotNames
      );

      expect(bot.name).toBe("Beta");
      expect(bot.color).toBe("blue"); // Next available color
      expect(bot.isBot).toBe(true);
      expect(bot.userId).toBeNull();
      expect(bot.id).toMatch(/^bot_\d+_[a-z0-9]+$/);
      expect(bot.avatar).toMatch(/^avt[1-4]$/);
    });

    test("should assign fallback color when all colors are taken", () => {
      const existingPlayers = [
        { name: "Player1", color: "red" },
        { name: "Player2", color: "green" },
        { name: "Player3", color: "blue" },
        { name: "Player4", color: "yellow" },
      ];

      generateUniqueBotName.mockReturnValue("Bot");

      const bot = botJoinerInstance.createBotPlayer(existingPlayers, []);

      expect(bot.color).toBe("red"); // Fallback color
    });
  });

  describe("Parallel Join Requests", () => {
    test("should handle parallel join requests correctly", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [],
        gameStatus: "waiting",
      };

      // Mock successful atomic updates
      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue({
        players: [],
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName
        .mockReturnValueOnce("Alpha")
        .mockReturnValueOnce("Beta")
        .mockReturnValueOnce("Gamma");

      // Simulate parallel join requests
      const joinPromises = [
        botJoinerInstance.joinBot(roomId, mockIo),
        botJoinerInstance.joinBot(roomId, mockIo),
        botJoinerInstance.joinBot(roomId, mockIo),
      ];

      const results = await Promise.all(joinPromises);

      // Should have successful joins (atomic updates prevent duplicates)
      const successfulJoins = results.filter((result) => result !== null);
      expect(successfulJoins.length).toBeGreaterThan(0);

      // Each successful bot should have a unique name
      const botNames = successfulJoins.map((bot) => bot.name);
      const uniqueNames = new Set(botNames);
      expect(uniqueNames.size).toBe(botNames.length);
    });

    test("should prevent duplicate bots in parallel requests", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [],
        gameStatus: "waiting",
      };

      // Mock atomic updates that would prevent duplicates
      // First 4 requests succeed, rest fail due to room being full
      GameRoom.findOneAndUpdate
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValue(null); // Room is full after 4 bots

      GameRoom.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockRoom),
      });
      GameRoom.updateOne.mockResolvedValue({});

      gameManager.getRoom.mockReturnValue({
        players: [],
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName.mockReturnValue("Alpha");

      // Simulate many parallel join requests
      const joinPromises = Array(10)
        .fill()
        .map(() => botJoinerInstance.joinBot(roomId, mockIo));

      const results = await Promise.all(joinPromises);

      // Should not exceed max players
      const successfulJoins = results.filter((result) => result !== null);
      expect(successfulJoins.length).toBeLessThanOrEqual(2); // MAX_PLAYERS for 2-player game
    });
  });

  describe("Edge Cases", () => {
    test("should handle human player joining between checks", async () => {
      const roomId = "room123";

      // First check shows room is eligible
      const initialRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1" }],
        gameStatus: "waiting",
      };

      // But atomic update fails due to human joining
      GameRoom.findOneAndUpdate.mockResolvedValue(null);

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });

    test("should handle room status change after atomic update", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1" }],
        gameStatus: "waiting",
      };

      // Atomic update succeeds
      GameRoom.findOneAndUpdate.mockResolvedValue(mockRoom);

      // But room status changed when we check again
      GameRoom.findOne.mockResolvedValue({
        ...mockRoom,
        gameStatus: "playing",
      });

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });

    test("should handle database errors gracefully", async () => {
      const roomId = "room123";
      GameRoom.findOneAndUpdate.mockRejectedValue(
        new Error("Connection timeout")
      );

      const result = await botJoinerInstance.joinBot(roomId, mockIo);

      expect(result).toBeNull();
    });
  });

  describe("Integration with gameManager", () => {
    test("should update gameManager state when bot joins", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      const mockGameManagerRoom = {
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue(mockGameManagerRoom);
      generateUniqueBotName.mockReturnValue("Alpha");

      await botJoinerInstance.joinBot(roomId, mockIo);

      expect(mockGameManagerRoom.players).toHaveLength(2);
      expect(mockGameManagerRoom.players[1].name).toBe("Alpha");
      expect(mockGameManagerRoom.players[1].isBot).toBe(true);
    });

    test("should update game status to playing when room is full", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [
          { id: "player1", name: "Player1", color: "red" },
          { id: "player2", name: "Player2", color: "green" },
          { id: "player3", name: "Player3", color: "blue" },
        ],
        gameStatus: "waiting",
      };

      const mockGameManagerRoom = {
        players: [
          { id: "player1", name: "Player1", color: "red" },
          { id: "player2", name: "Player2", color: "green" },
          { id: "player3", name: "Player3", color: "blue" },
        ],
        gameStatus: "waiting",
      };

      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue(mockGameManagerRoom);
      generateUniqueBotName.mockReturnValue("Alpha");

      await botJoinerInstance.joinBot(roomId, mockIo);

      expect(mockGameManagerRoom.gameStatus).toBe("playing");
    });
  });

  describe("Event Emission", () => {
    test("should emit playerJoined event when bot joins", async () => {
      const roomId = "room123";
      const mockRoom = {
        roomId,
        players: [{ id: "player1", name: "Player1", color: "red" }],
        gameStatus: "waiting",
      };

      setupGameRoomMocks(mockRoom);
      gameManager.getRoom.mockReturnValue({
        players: mockRoom.players,
        GAME_STATUS: { PLAYING: "playing" },
      });
      generateUniqueBotName.mockReturnValue("Alpha");

      await botJoinerInstance.joinBot(roomId, mockIo);

      expect(mockIo.to).toHaveBeenCalledWith(roomId);
      expect(mockIo.emit).toHaveBeenCalledWith(
        "playerJoined",
        expect.objectContaining({
          name: "Alpha",
          isBot: true,
        })
      );
    });
  });

  describe("getStatus", () => {
    test("should return current status information", () => {
      const status = botJoinerInstance.getStatus();

      expect(status).toEqual({
        useRedisLock: false,
        botJoinDelay: 100,
        maxPlayers: 2,
        botConfig: {
          maxBotsPerGame: 1,
          availableColors: ["green", "blue"],
        },
      });
    });
  });
});
