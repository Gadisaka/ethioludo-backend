const { BotController } = require("./controller");
const { gameManager } = require("../gameManager");

// Mock dependencies
jest.mock("../gameManager");
jest.mock("./config", () => ({
  getBotConfig: jest.fn(() => ({
    MOVE_DELAY_MS: 2000,
    DICE_ROLL_DELAY_MS: 1500,
    DIFFICULTY_LEVELS: {
      EASY: "easy",
      MEDIUM: "medium",
      HARD: "hard",
    },
  })),
}));

describe("BotController", () => {
  let botController;
  let mockIo;
  let mockRoom;
  let mockGameState;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Use fake timers for timer-related tests
    jest.useFakeTimers();

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
          difficulty: "medium",
          joinedAt: new Date(Date.now() - 1000),
        },
        {
          id: "human1",
          name: "John",
          color: "green",
          isBot: false,
          joinedAt: new Date(),
        },
        {
          id: "bot2",
          name: "Beta",
          color: "red",
          isBot: true,
          difficulty: "hard",
          joinedAt: new Date(),
        },
      ],
      gameStatus: "playing",
      currentTurn: "bot1",
      lastRoll: null,
      gameSettings: {
        requiredPieces: 2,
        stake: 50,
      },
      createdAt: Date.now(),
    };

    // Create mock game state
    mockGameState = {
      pieces: {
        blue: ["bh1", "bh2", "bh3", "bh4"],
        green: ["gh1", "gh2", "gh3", "gh4"],
        red: ["rh1", "rh2", "rh3", "rh4"],
      },
    };

    // Mock gameManager methods
    gameManager.getRoom.mockReturnValue(mockRoom);
    gameManager.getGameState.mockReturnValue(mockGameState);
    gameManager.GAME_STATUS = {
      PLAYING: "playing",
      FINISHED: "finished",
    };
    gameManager.DIE_STATUS = {
      ROLLING: "rolling",
    };

    // Create bot controller instance
    botController = new BotController({ logger: console });
    botController.initialize(mockIo);
  });

  afterEach(() => {
    // Restore real timers
    jest.useRealTimers();
  });

  describe("Initialization", () => {
    test("should initialize with Socket.io instance", () => {
      expect(botController.io).toBe(mockIo);
    });

    test("should have empty initial state", () => {
      expect(botController.activeBots.size).toBe(0);
      expect(botController.botTimers.size).toBe(0);
    });
  });

  describe("Game Start Handling", () => {
    test("should handle game start and identify bot players", () => {
      botController.handleGameStart("room123");

      expect(botController.activeBots.has("room123")).toBe(true);
      expect(botController.activeBots.get("room123").size).toBe(2);
      expect(botController.activeBots.get("room123").has("bot1")).toBe(true);
      expect(botController.activeBots.get("room123").has("bot2")).toBe(true);
    });

    test("should schedule first bot turn if first player is bot", () => {
      const scheduleSpy = jest.spyOn(botController, "scheduleBotTurn");

      botController.handleGameStart("room123");

      expect(scheduleSpy).toHaveBeenCalledWith("room123", "bot1");
    });

    test("should not schedule bot turn if first player is human", () => {
      mockRoom.players[0].isBot = false;
      const scheduleSpy = jest.spyOn(botController, "scheduleBotTurn");

      botController.handleGameStart("room123");

      expect(scheduleSpy).not.toHaveBeenCalled();
    });

    test("should handle room not found gracefully", () => {
      gameManager.getRoom.mockReturnValue(null);

      expect(() => {
        botController.handleGameStart("nonexistent");
      }).not.toThrow();
    });
  });

  describe("Turn Change Handling", () => {
    test("should schedule bot turn when it becomes bot's turn", () => {
      const scheduleSpy = jest.spyOn(botController, "scheduleBotTurn");

      botController.handleTurnChange("room123", "bot1");

      expect(scheduleSpy).toHaveBeenCalledWith("room123", "bot1");
    });

    test("should not schedule turn when it becomes human's turn", () => {
      const scheduleSpy = jest.spyOn(botController, "scheduleBotTurn");

      botController.handleTurnChange("room123", "human1");

      expect(scheduleSpy).not.toHaveBeenCalled();
    });

    test("should handle room not found gracefully", () => {
      gameManager.getRoom.mockReturnValue(null);

      expect(() => {
        botController.handleTurnChange("nonexistent", "bot1");
      }).not.toThrow();
    });
  });

  describe("Bot Turn Scheduling", () => {
    test("should schedule bot turn with calculated delay", () => {
      const executeSpy = jest.spyOn(botController, "executeBotTurn");

      botController.scheduleBotTurn("room123", "bot1");

      // Check that timer was set
      expect(botController.botTimers.has("room123")).toBe(true);
      expect(botController.botTimers.get("room123").has("bot1")).toBe(true);

      // Fast-forward time to trigger the timer
      jest.advanceTimersByTime(3000);

      expect(executeSpy).toHaveBeenCalledWith("room123", "bot1");
    });

    test("should clear existing timer before scheduling new one", () => {
      const clearSpy = jest.spyOn(botController, "clearBotTimer");

      botController.scheduleBotTurn("room123", "bot1");
      botController.scheduleBotTurn("room123", "bot1");

      expect(clearSpy).toHaveBeenCalledWith("room123", "bot1");
    });

    test("should handle non-bot player gracefully", () => {
      expect(() => {
        botController.scheduleBotTurn("room123", "human1");
      }).not.toThrow();
    });
  });

  describe("Bot Turn Execution", () => {
    test("should execute complete bot turn (roll dice + make move)", async () => {
      const rollSpy = jest.spyOn(botController, "rollDiceForBot");
      const moveSpy = jest.spyOn(botController, "makeBotMove");

      // Mock successful roll
      rollSpy.mockResolvedValue({ value: 6, color: "blue" });

      // Mock the delay after rolling dice
      jest.spyOn(global, "setTimeout").mockImplementation((fn) => {
        fn();
        return 123;
      });

      await botController.executeBotTurn("room123", "bot1");

      expect(rollSpy).toHaveBeenCalledWith("room123", "bot1");
      expect(moveSpy).toHaveBeenCalledWith("room123", "bot1", 6);
    });

    test("should handle turn change during execution", async () => {
      const rollSpy = jest.spyOn(botController, "rollDiceForBot");

      // Change turn before bot executes
      mockRoom.currentTurn = "human1";

      await botController.executeBotTurn("room123", "bot1");

      expect(rollSpy).not.toHaveBeenCalled();
    });

    test("should handle game status change during execution", async () => {
      const rollSpy = jest.spyOn(botController, "rollDiceForBot");

      // Change game status before bot executes
      mockRoom.gameStatus = "finished";

      await botController.executeBotTurn("room123", "bot1");

      expect(rollSpy).not.toHaveBeenCalled();
    });
  });

  describe("Dice Rolling", () => {
    test("should roll dice for bot and emit events", async () => {
      // Mock the setTimeout to resolve immediately
      jest.spyOn(global, "setTimeout").mockImplementation((fn) => {
        fn();
        return 123;
      });

      const result = await botController.rollDiceForBot("room123", "bot1");

      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.color).toBe("blue");

      // Check that events were emitted
      expect(mockIo.to).toHaveBeenCalledWith("room123");
      expect(mockIo.emit).toHaveBeenCalledWith("rolling_dice", {
        playerId: "bot1",
      });
      expect(mockIo.emit).toHaveBeenCalledWith(
        "roll_dice",
        expect.objectContaining({
          value: expect.any(Number),
          roller: "bot1",
        })
      );
    });

    test("should handle roll failure gracefully", async () => {
      // Mock the setTimeout to resolve immediately
      jest.spyOn(global, "setTimeout").mockImplementation((fn) => {
        fn();
        return 123;
      });

      gameManager.getGameState.mockReturnValue(null);

      const result = await botController.rollDiceForBot("room123", "bot1");

      expect(result).toBeNull();
    });
  });

  describe("Move Making", () => {
    test("should evaluate legal moves and select best move", async () => {
      const evaluateSpy = jest.spyOn(botController, "evaluateLegalMoves");
      const selectSpy = jest.spyOn(botController, "selectBestMove");
      const executeSpy = jest.spyOn(botController, "executeBotMove");

      // Mock successful move execution
      executeSpy.mockResolvedValue(true);

      await botController.makeBotMove("room123", "bot1", 6);

      expect(evaluateSpy).toHaveBeenCalledWith("room123", "blue", 6);
      expect(selectSpy).toHaveBeenCalled();
      expect(executeSpy).toHaveBeenCalled();
    });

    test("should handle no legal moves gracefully", async () => {
      const evaluateSpy = jest.spyOn(botController, "evaluateLegalMoves");
      evaluateSpy.mockReturnValue([]);

      const result = await botController.makeBotMove("room123", "bot1", 6);

      expect(result).toBe(false);
    });
  });

  describe("Move Evaluation", () => {
    test("should identify legal moves correctly", () => {
      const legalMoves = botController.evaluateLegalMoves("room123", "blue", 6);

      expect(Array.isArray(legalMoves)).toBe(true);
      // Should find moves for pieces starting at home with roll 6
      expect(legalMoves.length).toBeGreaterThan(0);
    });

    test("should handle invalid game state gracefully", () => {
      gameManager.getGameState.mockReturnValue(null);

      const legalMoves = botController.evaluateLegalMoves("room123", "blue", 6);

      expect(legalMoves).toEqual([]);
    });
  });

  describe("Move Selection", () => {
    test("should select winning moves as highest priority", () => {
      const legalMoves = [
        { isWinZone: false, isHome: false, isSafe: true },
        { isWinZone: true, isHome: false, isSafe: false },
        { isWinZone: false, isHome: true, isSafe: false },
      ];

      const selectedMove = botController.selectBestMove(legalMoves, "medium");

      expect(selectedMove.isWinZone).toBe(true);
    });

    test("should select home moves as second priority", () => {
      const legalMoves = [
        { isWinZone: false, isHome: false, isSafe: true },
        { isWinZone: false, isHome: true, isSafe: false },
        { isWinZone: false, isHome: false, isSafe: false },
      ];

      const selectedMove = botController.selectBestMove(legalMoves, "medium");

      expect(selectedMove.isHome).toBe(true);
    });

    test("should return single move if only one available", () => {
      const legalMoves = [{ isWinZone: false, isHome: false, isSafe: true }];

      const selectedMove = botController.selectBestMove(legalMoves, "medium");

      expect(selectedMove).toBe(legalMoves[0]);
    });
  });

  describe("Timer Management", () => {
    test("should clear bot timer correctly", () => {
      // Schedule a turn first
      botController.scheduleBotTurn("room123", "bot1");

      // Clear the timer
      botController.clearBotTimer("room123", "bot1");

      expect(botController.botTimers.get("room123").has("bot1")).toBe(false);
    });

    test("should cleanup all timers for a room", () => {
      // Schedule turns for multiple bots
      botController.scheduleBotTurn("room123", "bot1");
      botController.scheduleBotTurn("room123", "bot2");

      // Cleanup all timers
      botController.cleanupBotTimers("room123");

      expect(botController.botTimers.has("room123")).toBe(false);
    });
  });

  describe("Game End Handling", () => {
    test("should cleanup bot state when game ends", () => {
      // Set up some bot state first
      botController.activeBots.set("room123", new Set(["bot1", "bot2"]));
      botController.botTimers.set(
        "room123",
        new Map([["bot1", setTimeout(() => {}, 1000)]])
      );

      botController.handleGameEnd("room123");

      expect(botController.activeBots.has("room123")).toBe(false);
      expect(botController.botTimers.has("room123")).toBe(false);
    });
  });

  describe("Reaction Delay Calculation", () => {
    test("should calculate different delays based on difficulty", () => {
      const baseDelay = 2000;

      // Mock Math.random to return consistent values for testing
      const originalRandom = Math.random;
      Math.random = jest
        .fn()
        .mockReturnValueOnce(0.5) // For easy delay
        .mockReturnValueOnce(0.5) // For medium delay
        .mockReturnValueOnce(0.5); // For hard delay

      const easyDelay = botController.calculateReactionDelay("easy", baseDelay);
      const mediumDelay = botController.calculateReactionDelay(
        "medium",
        baseDelay
      );
      const hardDelay = botController.calculateReactionDelay("hard", baseDelay);

      expect(easyDelay).toBeGreaterThan(mediumDelay);
      expect(mediumDelay).toBeGreaterThan(hardDelay);

      // Restore Math.random
      Math.random = originalRandom;
    });

    test("should add randomness to delays", () => {
      const baseDelay = 2000;

      const delay1 = botController.calculateReactionDelay("medium", baseDelay);
      const delay2 = botController.calculateReactionDelay("medium", baseDelay);

      // Delays should be different due to randomness
      expect(delay1).not.toBe(delay2);
    });
  });

  describe("Safe Roll Value", () => {
    test("should return valid dice values", () => {
      const value = botController.getSafeRollValue(
        mockGameState.pieces,
        "blue"
      );

      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    });

    test("should handle errors gracefully", () => {
      const value = botController.getSafeRollValue(null, "blue");

      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
    });
  });

  describe("Bot Action Logging", () => {
    test("should emit bot action events", () => {
      botController.emitBotActionLog("room123", "test_action", {
        test: "data",
      });

      expect(mockIo.to).toHaveBeenCalledWith("room123");
      expect(mockIo.emit).toHaveBeenCalledWith(
        "botAction",
        expect.objectContaining({
          action: "test_action",
          test: "data",
          timestamp: expect.any(String),
        })
      );
    });

    test("should handle missing io gracefully", () => {
      botController.io = null;

      expect(() => {
        botController.emitBotActionLog("room123", "test_action", {
          test: "data",
        });
      }).not.toThrow();
    });
  });

  describe("Status Information", () => {
    test("should return correct status information", () => {
      // Set up some state
      botController.activeBots.set("room123", new Set(["bot1", "bot2"]));
      botController.botTimers.set(
        "room123",
        new Map([["bot1", setTimeout(() => {}, 1000)]])
      );

      const status = botController.getStatus();

      expect(status.activeRooms).toBe(1);
      expect(status.totalActiveBots).toBe(2);
      expect(status.activeTimers).toBe(1);
      expect(status.config).toBeDefined();
    });
  });
});
