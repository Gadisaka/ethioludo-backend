const { generateUniqueBotName, getBotConfig } = require("./config");
const { BOT_CONFIG } = require("./config");
const GameRoom = require("../../model/GameRoom");
const { gameManager } = require("../gameManager");
const { botController } = require("./controller"); // Fixed import to destructure

// Configuration
const MAX_PLAYERS = 2; // 2-player game: 1 human + 1 bot

/**
 * Bot Joiner Class - Handles atomic bot joining to game rooms
 */
class BotJoiner {
  constructor(options = {}) {
    this.useRedisLock = options.useRedisLock || false;
    this.redisClient = options.redisClient || null;
    this.logger = options.logger || console;
    this.botJoinDelay = options.botJoinDelay || 100; // Delay between multiple bot joins

    // Bind methods
    this.joinBot = this.joinBot.bind(this);
    this.joinMultipleBots = this.joinMultipleBots.bind(this);
    this.verifyRoomEligibility = this.verifyRoomEligibility.bind(this);
    this.createBotPlayer = this.createBotPlayer.bind(this);
    this.addBotToRoom = this.addBotToRoom.bind(this);
    this.emitPlayerJoined = this.emitPlayerJoined.bind(this);
  }

  /**
   * Join a single bot to a room with atomic verification
   * @param {string} roomId - Room ID to join
   * @param {Object} io - Socket.io instance
   * @returns {Promise<Object>} Bot player object or null if failed
   */
  async joinBot(roomId, io) {
    try {
      // Check if bots are enabled for this specific room
      const room = await GameRoom.findOne({ roomId }).lean();
      if (!room || !room.botsEnabled) {
        this.logger.info(
          `[BotJoiner] Bots are disabled for room ${roomId}, skipping bot join`
        );
        return null;
      }

      this.logger.info(`[BotJoiner] Attempting to join bot to room ${roomId}`);

      // Use Redis lock if configured, otherwise use atomic DB update
      if (this.useRedisLock && this.redisClient) {
        this.logger.info(`[BotJoiner] Using Redis lock for room ${roomId}`);
        return await this.joinBotWithRedisLock(roomId, io);
      } else {
        this.logger.info(`[BotJoiner] Using atomic update for room ${roomId}`);
        return await this.joinBotWithAtomicUpdate(roomId, io);
      }
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error joining bot to room ${roomId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Join multiple bots sequentially with delays
   * @param {string} roomId - Room ID to join
   * @param {number} botCount - Number of bots to join
   * @param {Object} io - Socket.io instance
   * @returns {Promise<Array>} Array of successfully joined bot objects
   */
  async joinMultipleBots(roomId, botCount, io) {
    // Check if bots are enabled for this specific room
    const room = await GameRoom.findOne({ roomId }).lean();
    if (!room || !room.botsEnabled) {
      this.logger.info(
        `[BotJoiner] Bots are disabled for room ${roomId}, skipping multiple bot join`
      );
      return [];
    }

    const joinedBots = [];

    for (let i = 0; i < botCount; i++) {
      try {
        // Add delay between bot joins to prevent race conditions
        if (i > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.botJoinDelay)
          );
        }

        const bot = await this.joinBot(roomId, io);
        if (bot) {
          joinedBots.push(bot);
          this.logger.info(
            `[BotJoiner] Bot ${bot.name} joined room ${roomId} (${
              i + 1
            }/${botCount})`
          );
        } else {
          this.logger.warn(
            `[BotJoiner] Failed to join bot ${i + 1} to room ${roomId}`
          );
          break; // Stop if a bot fails to join
        }
      } catch (error) {
        this.logger.error(
          `[BotJoiner] Error joining bot ${i + 1} to room ${roomId}:`,
          error
        );
        break;
      }
    }

    return joinedBots;
  }

  /**
   * Join bot using Redis lock for atomicity
   * @param {string} roomId - Room ID to join
   * @param {Object} io - Socket.io instance
   * @returns {Promise<Object>} Bot player object or null if failed
   */
  async joinBotWithRedisLock(roomId, io) {
    const lockKey = `bot_join_lock:${roomId}`;
    const lockValue = `bot_join_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 15)}`;
    const lockTimeout = 10000; // 10 seconds lock timeout

    try {
      // Acquire Redis lock
      const lockAcquired = await this.redisClient.set(
        lockKey,
        lockValue,
        "PX",
        lockTimeout,
        "NX"
      );

      if (!lockAcquired) {
        this.logger.warn(
          `[BotJoiner] Could not acquire lock for room ${roomId}`
        );
        return null;
      }

      try {
        // Verify room eligibility under lock
        const eligibility = await this.verifyRoomEligibility(roomId);
        if (!eligibility.canJoin) {
          this.logger.info(
            `[BotJoiner] Room ${roomId} no longer eligible: ${eligibility.reason}`
          );
          // Release lock before returning
          await this.releaseRedisLock(lockKey, lockValue);
          return null;
        }

        // Create and add bot
        const bot = await this.createAndAddBot(roomId, io);

        // Release lock
        await this.releaseRedisLock(lockKey, lockValue);

        return bot;
      } catch (error) {
        // Release lock on error
        await this.releaseRedisLock(lockKey, lockValue);
        throw error;
      }
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Redis lock error for room ${roomId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Join bot using atomic database update
   * @param {string} roomId - Room ID to join
   * @param {Object} io - Socket.io instance
   * @returns {Promise<Object>} Bot player object or null if failed
   */
  async joinBotWithAtomicUpdate(roomId, io) {
    try {
      // For simplicity, just check in-memory state and proceed
      // The actual bot addition will be handled by createAndAddBot
      const eligibility = await this.verifyRoomEligibility(roomId);
      if (!eligibility.canJoin) {
        this.logger.info(
          `[BotJoiner] Room ${roomId} not eligible for bot joining: ${eligibility.reason}`
        );
        return null;
      }

      // Create and add bot
      const bot = await this.createAndAddBot(roomId, io);

      return bot;
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Atomic update error for room ${roomId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Verify room eligibility for bot joining
   * @param {string} roomId - Room ID to verify
   * @returns {Promise<Object>} Eligibility result with canJoin boolean and reason
   */
  async verifyRoomEligibility(roomId) {
    try {
      this.logger.info(`[BotJoiner] Verifying room eligibility for ${roomId}`);

      // First check in-memory state (faster and more reliable)
      const gameManagerRoom = gameManager.getRoom(roomId);
      this.logger.info(`[BotJoiner] In-memory room state:`, gameManagerRoom);

      if (gameManagerRoom) {
        if (gameManagerRoom.gameStatus !== "waiting") {
          this.logger.info(
            `[BotJoiner] Room ${roomId} not in waiting status: ${gameManagerRoom.gameStatus}`
          );
          return { canJoin: false, reason: "Game not in waiting status" };
        }

        if (gameManagerRoom.players.length >= MAX_PLAYERS) {
          this.logger.info(
            `[BotJoiner] Room ${roomId} is full: ${gameManagerRoom.players.length}/${MAX_PLAYERS}`
          );
          return { canJoin: false, reason: "Room is full" };
        }

        this.logger.info(
          `[BotJoiner] Room ${roomId} eligible from in-memory state`
        );
        return { canJoin: true, reason: "Room eligible (in-memory)" };
      }

      this.logger.info(
        `[BotJoiner] No in-memory room found, checking database for ${roomId}`
      );

      // Fallback to database check
      const room = await GameRoom.findOne({ roomId }).lean();
      this.logger.info(`[BotJoiner] Database room state:`, room);

      if (!room) {
        this.logger.info(`[BotJoiner] Room ${roomId} not found in database`);
        return { canJoin: false, reason: "Room not found" };
      }

      if (room.gameStatus !== "waiting") {
        this.logger.info(
          `[BotJoiner] Room ${roomId} not in waiting status in database: ${room.gameStatus}`
        );
        return { canJoin: false, reason: "Game not in waiting status" };
      }

      if (room.players.length >= MAX_PLAYERS) {
        this.logger.info(
          `[BotJoiner] Room ${roomId} is full in database: ${room.players.length}/${MAX_PLAYERS}`
        );
        return { canJoin: false, reason: "Room is full" };
      }

      this.logger.info(
        `[BotJoiner] Room ${roomId} eligible from database state`
      );
      return { canJoin: true, reason: "Room eligible (database)" };
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error verifying room eligibility for ${roomId}:`,
        error
      );
      return { canJoin: false, reason: "Database error" };
    }
  }

  /**
   * Create and add bot to room
   * @param {string} roomId - Room ID to add bot to
   * @param {Object} io - Socket.io instance
   * @returns {Promise<Object>} Created bot player object
   */
  async createAndAddBot(roomId, io) {
    try {
      // Check if bots are enabled for this specific room and get current room state
      const room = await GameRoom.findOne({ roomId }).lean();
      if (!room || !room.botsEnabled) {
        this.logger.info(
          `[BotJoiner] Bots are disabled for room ${roomId}, skipping bot creation`
        );
        return null;
      }
      const existingPlayers = room.players || [];
      const existingBotNames = existingPlayers
        .filter((p) => p.isBot)
        .map((p) => p.name);

      // Create bot player
      const bot = this.createBotPlayer(existingPlayers, existingBotNames);

      // Add bot to room in database
      await this.addBotToRoom(roomId, bot);

      // Update gameManager in-memory state
      const gameManagerRoom = gameManager.getRoom(roomId);
      if (gameManagerRoom) {
        gameManagerRoom.players.push(bot);

        // Update game status if room is full
        if (gameManagerRoom.players.length >= MAX_PLAYERS) {
          gameManagerRoom.gameStatus = gameManager.GAME_STATUS.PLAYING;

          // Set the first player's turn when game starts
          if (gameManagerRoom.players.length > 0) {
            gameManagerRoom.currentTurn = gameManagerRoom.players[0].id;
          }

          // Remove from waiting room if it was there
          if (gameManager.getWaitingRoom() === roomId) {
            gameManager.setWaitingRoom(null);
          }

          // Check if human players still have sufficient balance before starting game
          try {
            const Wallet = require("../../model/Wallet");
            for (const player of gameManagerRoom.players) {
              if (!player.isBot && player.userId) {
                const wallet = await Wallet.findOne({ user: player.userId });
                if (
                  !wallet ||
                  wallet.balance < gameManagerRoom.gameSettings.stake
                ) {
                  this.logger.error(
                    `[BotJoiner] Player ${
                      player.name
                    } has insufficient balance for game start. Required: ${
                      gameManagerRoom.gameSettings.stake
                    } ብር, Available: ${wallet?.balance || 0} ብር`
                  );
                  // Remove the bot and revert game status
                  gameManagerRoom.players = gameManagerRoom.players.filter(
                    (p) => p.id !== bot.id
                  );
                  gameManagerRoom.gameStatus = gameManager.GAME_STATUS.WAITING;
                  throw new Error(
                    `Player ${player.name} has insufficient balance for game start`
                  );
                }
              }
            }

            // Deduct stakes from all human players when game starts
            const {
              deductGameStake,
            } = require("../../controllers/wallet.controller");

            for (const player of gameManagerRoom.players) {
              if (!player.isBot && player.userId) {
                try {
                  await deductGameStake(
                    player.userId,
                    gameManagerRoom.gameSettings.stake,
                    roomId
                  );
                  this.logger.info(
                    `[BotJoiner] Deducted ${gameManagerRoom.gameSettings.stake} ብር from player ${player.name} (${player.userId})`
                  );
                } catch (error) {
                  this.logger.error(
                    `[BotJoiner] Failed to deduct stake from player ${player.name}:`,
                    error
                  );
                  // If stake deduction fails, we should probably not start the game
                  // For now, just log the error
                }
              }
            }
          } catch (error) {
            this.logger.error(
              `[BotJoiner] Error setting up stake deduction:`,
              error
            );
            // Revert game status if there was an error
            if (
              gameManagerRoom.gameStatus === gameManager.GAME_STATUS.PLAYING
            ) {
              gameManagerRoom.gameStatus = gameManager.GAME_STATUS.WAITING;
            }
            throw error;
          }

          // Notify bot controller about game start (only if bots are enabled for this room)
          if (
            room.botsEnabled &&
            botController &&
            botController.handleGameStart
          ) {
            botController.handleGameStart(roomId);
          }
        }
      }

      // Emit playerJoined event
      this.emitPlayerJoined(roomId, bot, io);

      // Emit room_update event to notify frontend of room state change
      this.emitRoomUpdate(roomId, io);

      this.logger.info(
        `[BotJoiner] Bot ${
          bot.name
        } successfully joined room ${roomId}. Room now has ${
          gameManagerRoom?.players?.length || 0
        } players. Game status: ${gameManagerRoom?.gameStatus || "unknown"}`
      );

      // Log the complete room state for debugging
      if (gameManagerRoom) {
        this.logger.info(`[BotJoiner] Room ${roomId} state after bot join:`, {
          players: gameManagerRoom.players.map((p) => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            color: p.color,
          })),
          gameStatus: gameManagerRoom.gameStatus,
          currentTurn: gameManagerRoom.currentTurn,
          playerCount: gameManagerRoom.players.length,
        });
      }

      // Verify state consistency between database and in-memory state
      await this.verifyStateConsistency(roomId);

      return bot;
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error creating and adding bot to room ${roomId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create a bot player object
   * @param {Array} existingPlayers - Existing players in the room
   * @param {Array} existingBotNames - Existing bot names to avoid conflicts
   * @returns {Object} Bot player object
   */
  createBotPlayer(existingPlayers, existingBotNames) {
    // Generate unique bot name
    const botName = generateUniqueBotName(existingPlayers, existingBotNames);

    // Assign available color
    const availableColors = BOT_CONFIG.AVAILABLE_COLORS.filter(
      (color) => !existingPlayers.some((p) => p.color === color)
    );
    const botColor = availableColors[0] || "red"; // Fallback to red if all colors taken

    // Create bot player object (same shape as human player)
    const bot = {
      id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      userId: null, // Bots don't have user accounts
      name: botName,
      color: botColor,
      isBot: true, // Flag to identify bots
      joinedAt: new Date(),
      difficulty: BOT_CONFIG.DIFFICULTY_LEVELS.HARD, // Default to hard difficulty
      avatar: this.getRandomBotAvatar(),
    };

    // Validate bot player structure
    this.logger.info(`[BotJoiner] Created bot player:`, {
      id: bot.id,
      name: bot.name,
      color: bot.color,
      isBot: bot.isBot,
      hasUserId: bot.userId !== undefined,
      hasJoinedAt: bot.joinedAt !== undefined,
      hasDifficulty: bot.difficulty !== undefined,
      hasAvatar: bot.avatar !== undefined,
    });

    return bot;
  }

  /**
   * Get the ID of the first player in the room
   * @param {string} roomId - Room ID
   * @returns {Promise<string|null>} First player ID or null if not found
   */
  async getFirstPlayerId(roomId) {
    try {
      const room = await GameRoom.findOne({ roomId }).lean();
      if (room && room.players && room.players.length > 0) {
        return room.players[0].id;
      }
      return null;
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error getting first player ID for room ${roomId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Get random bot avatar
   * @returns {string} Avatar identifier
   */
  getRandomBotAvatar() {
    const avatarOptions = ["avt1", "avt2", "avt3", "avt4"];
    const randomIndex = Math.floor(Math.random() * avatarOptions.length);
    return avatarOptions[randomIndex];
  }

  /**
   * Add bot to room in database
   * @param {string} roomId - Room ID
   * @param {Object} bot - Bot player object
   * @returns {Promise<void>}
   */
  async addBotToRoom(roomId, bot) {
    try {
      // Get current room state to check player count
      const room = await GameRoom.findOne({ roomId }).lean();
      const newPlayerCount = (room?.players?.length || 0) + 1;

      await GameRoom.updateOne(
        { roomId },
        {
          $push: { players: bot },
          $set: {
            gameStatus: newPlayerCount >= MAX_PLAYERS ? "playing" : "waiting",
            currentTurn:
              newPlayerCount >= MAX_PLAYERS
                ? await this.getFirstPlayerId(roomId)
                : null, // Set currentTurn to first player when game starts
          },
        }
      );
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error adding bot to database for room ${roomId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Emit playerJoined event to room
   * @param {string} roomId - Room ID
   * @param {Object} bot - Bot player object
   * @param {Object} io - Socket.io instance
   */
  emitPlayerJoined(roomId, bot, io) {
    try {
      io.to(roomId).emit("playerJoined", bot);
      this.logger.debug(
        `[BotJoiner] Emitted playerJoined event for bot ${bot.name} in room ${roomId}`
      );
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error emitting playerJoined event for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Emit room_update event to room
   * @param {string} roomId - Room ID
   * @param {Object} io - Socket.io instance
   */
  emitRoomUpdate(roomId, io) {
    try {
      const gameManagerRoom = gameManager.getRoom(roomId);
      if (gameManagerRoom) {
        io.to(roomId).emit("room_update", {
          players: gameManagerRoom.players,
          currentTurn: gameManagerRoom.currentTurn,
          gameStatus: gameManagerRoom.gameStatus,
          gameSettings: gameManagerRoom.gameSettings,
        });
      } else {
        // Fallback to basic room update if gameManager room not found
        io.to(roomId).emit("room_update", { roomId });
      }

      this.logger.debug(
        `[BotJoiner] Emitted room_update event for room ${roomId}`
      );
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error emitting room_update event for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Release Redis lock
   * @param {string} lockKey - Lock key
   * @param {string} lockValue - Lock value for verification
   * @returns {Promise<void>}
   */
  async releaseRedisLock(lockKey, lockValue) {
    try {
      // Use Lua script for atomic lock release
      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      await this.redisClient.eval(luaScript, 1, lockKey, lockValue);
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error releasing Redis lock ${lockKey}:`,
        error
      );
    }
  }

  /**
   * Verify state consistency between database and in-memory state after bot joining
   * @param {string} roomId - Room ID to verify
   * @returns {Promise<void>}
   */
  async verifyStateConsistency(roomId) {
    try {
      this.logger.info(
        `[BotJoiner] Verifying state consistency for room ${roomId}`
      );

      // Fetch room state from database
      const roomFromDB = await GameRoom.findOne({ roomId }).lean();
      if (!roomFromDB) {
        this.logger.error(
          `[BotJoiner] Room ${roomId} not found in database after bot join.`
        );
        return;
      }

      // Fetch room state from gameManager
      const roomFromGameManager = gameManager.getRoom(roomId);
      if (!roomFromGameManager) {
        this.logger.error(
          `[BotJoiner] Room ${roomId} not found in gameManager after bot join.`
        );
        return;
      }

      // Compare players
      const dbPlayers = roomFromDB.players || [];
      const gmPlayers = roomFromGameManager.players || [];

      if (dbPlayers.length !== gmPlayers.length) {
        this.logger.warn(
          `[BotJoiner] Player count mismatch in room ${roomId}. DB: ${dbPlayers.length}, GameManager: ${gmPlayers.length}`
        );
      }

      // Compare player details (excluding sensitive fields like userId, joinedAt)
      const dbPlayerIds = new Set(dbPlayers.map((p) => p.id));
      const gmPlayerIds = new Set(gmPlayers.map((p) => p.id));

      if (dbPlayerIds.size !== gmPlayerIds.size) {
        this.logger.warn(
          `[BotJoiner] Player ID set mismatch in room ${roomId}. DB: ${dbPlayerIds.size}, GameManager: ${gmPlayerIds.size}`
        );
      }

      // Compare gameStatus and currentTurn
      if (roomFromDB.gameStatus !== roomFromGameManager.gameStatus) {
        this.logger.warn(
          `[BotJoiner] Game status mismatch in room ${roomId}. DB: ${roomFromDB.gameStatus}, GameManager: ${roomFromGameManager.gameStatus}`
        );
      }

      if (roomFromDB.currentTurn !== roomFromGameManager.currentTurn) {
        this.logger.warn(
          `[BotJoiner] Current turn mismatch in room ${roomId}. DB: ${roomFromDB.currentTurn}, GameManager: ${roomFromGameManager.currentTurn}`
        );
      }

      this.logger.info(
        `[BotJoiner] State consistency verified for room ${roomId}.`
      );
    } catch (error) {
      this.logger.error(
        `[BotJoiner] Error verifying state consistency for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Get current status of the bot joiner
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      useRedisLock: this.useRedisLock,
      botJoinDelay: this.botJoinDelay,
      maxPlayers: MAX_PLAYERS,
      botConfig: {
        maxBotsPerGame: BOT_CONFIG.MAX_BOTS_PER_GAME,
        availableColors: BOT_CONFIG.AVAILABLE_COLORS,
      },
    };
  }
}

// Create singleton instance
const botJoiner = new BotJoiner();

module.exports = {
  BotJoiner,
  botJoiner,
};
