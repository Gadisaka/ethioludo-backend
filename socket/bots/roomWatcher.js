const { getBotConfigSync } = require("./config");
const GameRoom = require("../../model/GameRoom");
const { gameManager } = require("../gameManager");

// Configuration
const BOT_CONFIG = getBotConfigSync();
const SWEEP_INTERVAL_MS = 5000; // 5 seconds
const MAX_PLAYERS = 2; // 2-player game: 1 human + 1 bot

/**
 * Room Watcher Class - Monitors rooms for bot joining opportunities
 */
class RoomWatcher {
  constructor(options = {}) {
    this.isRunning = false;
    this.sweepInterval = null;
    this.pendingJoins = new Map(); // roomId -> { scheduledAt, attempts }
    this.useRedis = options.useRedis || false;
    this.redisClient = options.redisClient || null;
    this.logger = options.logger || console;

    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this.sweep = this.sweep.bind(this);
    this.markRoomAsPending = this.markRoomAsPending.bind(this);
    this.isRoomPending = this.isRoomPending.bind(this);
    this.clearPendingRoom = this.clearPendingRoom.bind(this);
  }

  /**
   * Start the room watcher
   */
  start() {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.info(
        "[RoomWatcher] Bots are disabled globally, not starting room watcher"
      );
      return;
    }

    if (this.isRunning) {
      this.logger.warn("[RoomWatcher] Already running");
      return;
    }

    this.isRunning = true;
    this.sweepInterval = setInterval(this.sweep, SWEEP_INTERVAL_MS);
    this.logger.info(
      `[RoomWatcher] Started with ${SWEEP_INTERVAL_MS}ms sweep interval`
    );

    // Perform initial sweep
    this.sweep();
  }

  /**
   * Stop the room watcher
   */
  stop() {
    if (!this.isRunning) {
      this.logger.warn("[RoomWatcher] Not running");
      return;
    }

    this.isRunning = false;
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }

    // Clear all pending joins
    this.pendingJoins.clear();
    this.logger.info("[RoomWatcher] Stopped");
  }

  /**
   * Main sweep function - identifies rooms ready for bot joining
   */
  async sweep() {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, skipping sweep"
        );
        return;
      }

      const now = Date.now();
      const cutoffTime = now - BOT_CONFIG.JOIN_DELAY_MS;

      this.logger.debug(
        `[RoomWatcher] Sweeping for rooms created before ${new Date(
          cutoffTime
        ).toISOString()}`
      );

      // Query for rooms that meet bot joining criteria
      const eligibleRooms = await this.findEligibleRooms(cutoffTime);

      if (eligibleRooms.length > 0) {
        this.logger.info(
          `[RoomWatcher] Found ${eligibleRooms.length} eligible rooms for bot joining`
        );

        for (const room of eligibleRooms) {
          await this.processEligibleRoom(room);
        }
      }

      // Clean up expired pending joins
      this.cleanupExpiredPendingJoins(now);
    } catch (error) {
      this.logger.error("[RoomWatcher] Error during sweep:", error);
    }
  }

  /**
   * Find rooms eligible for bot joining
   */
  async findEligibleRooms(cutoffTime) {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, no eligible rooms"
        );
        return [];
      }

      const query = {
        gameStatus: "waiting",
        createdAt: { $lte: new Date(cutoffTime) },
        $expr: { $lt: [{ $size: "$players" }, MAX_PLAYERS] },
      };

      // Exclude rooms already marked as pending
      if (this.useRedis && this.redisClient) {
        // Redis variant: exclude rooms with pending flags
        const pendingRoomIds = await this.getRedisPendingRoomIds();
        if (pendingRoomIds.length > 0) {
          query._id = { $nin: pendingRoomIds };
        }
      } else {
        // In-memory variant: exclude rooms already in pendingJoins
        const pendingRoomIds = Array.from(this.pendingJoins.keys());
        if (pendingRoomIds.length > 0) {
          query._id = { $nin: pendingRoomIds };
        }
      }

      const rooms = await GameRoom.find(query)
        .select("_id roomId players gameStatus createdAt gameSettings")
        .lean();

      return rooms;
    } catch (error) {
      this.logger.error("[RoomWatcher] Error finding eligible rooms:", error);
      return [];
    }
  }

  /**
   * Process a single eligible room
   */
  async processEligibleRoom(room) {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, skipping room processing"
        );
        return;
      }

      const roomId = room.roomId;
      const currentPlayerCount = room.players.length;
      const maxBotsAllowed = Math.min(
        BOT_CONFIG.MAX_BOTS_PER_GAME,
        MAX_PLAYERS - currentPlayerCount
      );

      this.logger.info(
        `[RoomWatcher] Room ${roomId} eligible: ${currentPlayerCount}/${MAX_PLAYERS} players, ${maxBotsAllowed} bots allowed`
      );

      // Mark room as pending for bot joining
      await this.markRoomAsPending(roomId, {
        roomId,
        maxBotsAllowed,
        currentPlayerCount,
        gameSettings: room.gameSettings,
      });
    } catch (error) {
      this.logger.error(
        `[RoomWatcher] Error processing room ${room.roomId}:`,
        error
      );
    }
  }

  /**
   * Mark a room as pending for bot joining
   */
  async markRoomAsPending(roomId, joinData) {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, skipping room marking as pending"
        );
        return;
      }

      if (this.useRedis && this.redisClient) {
        await this.markRoomAsPendingRedis(roomId, joinData);
      } else {
        this.markRoomAsPendingMemory(roomId, joinData);
      }

      this.logger.info(
        `[RoomWatcher] Room ${roomId} marked as pending for bot joining`
      );

      // Emit event for bot manager to handle
      this.emitBotJoinPending(roomId, joinData);
    } catch (error) {
      this.logger.error(
        `[RoomWatcher] Error marking room ${roomId} as pending:`,
        error
      );
    }
  }

  /**
   * Mark room as pending using Redis (atomic operation)
   */
  async markRoomAsPendingRedis(roomId, joinData) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, not marking room as pending in Redis"
      );
      return;
    }

    const key = `bot_join_pending:${roomId}`;
    const value = JSON.stringify({
      ...joinData,
      scheduledAt: Date.now(),
      attempts: 0,
    });

    // Use SET with NX (only if not exists) for atomicity
    const result = await this.redisClient.set(key, value, "EX", 300, "NX"); // 5 minute expiry

    if (!result) {
      throw new Error(`Room ${roomId} already marked as pending`);
    }
  }

  /**
   * Mark room as pending using in-memory storage
   */
  markRoomAsPendingMemory(roomId, joinData) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, not marking room as pending in memory"
      );
      return;
    }

    if (this.pendingJoins.has(roomId)) {
      throw new Error(`Room ${roomId} already marked as pending`);
    }

    this.pendingJoins.set(roomId, {
      ...joinData,
      scheduledAt: Date.now(),
      attempts: 0,
    });
  }

  /**
   * Check if a room is pending for bot joining
   */
  async isRoomPending(roomId) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, no rooms are pending"
      );
      return false;
    }

    if (this.useRedis && this.redisClient) {
      return await this.isRoomPendingRedis(roomId);
    } else {
      return this.isRoomPendingMemory(roomId);
    }
  }

  /**
   * Check if room is pending using Redis
   */
  async isRoomPendingRedis(roomId) {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, no rooms are pending in Redis"
        );
        return false;
      }

      const key = `bot_join_pending:${roomId}`;
      const result = await this.redisClient.get(key);
      return result !== null;
    } catch (error) {
      this.logger.error(
        `[RoomWatcher] Error checking Redis pending status for room ${roomId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Check if room is pending using in-memory storage
   */
  isRoomPendingMemory(roomId) {
    // Check if bots are disabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, no rooms are pending in memory"
      );
      return false;
    }

    return this.pendingJoins.has(roomId);
  }

  /**
   * Clear pending status for a room
   */
  async clearPendingRoom(roomId) {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, no pending rooms to clear"
        );
        return;
      }

      if (this.useRedis && this.redisClient) {
        await this.clearPendingRoomRedis(roomId);
      } else {
        this.clearPendingRoomMemory(roomId);
      }

      this.logger.debug(
        `[RoomWatcher] Cleared pending status for room ${roomId}`
      );
    } catch (error) {
      this.logger.error(
        `[RoomWatcher] Error clearing pending status for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Clear pending room using Redis
   */
  async clearPendingRoomRedis(roomId) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, not clearing pending room in Redis"
      );
      return;
    }

    const key = `bot_join_pending:${roomId}`;
    await this.redisClient.del(key);
  }

  /**
   * Clear pending room using in-memory storage
   */
  clearPendingRoomMemory(roomId) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, not clearing pending room in memory"
      );
      return;
    }

    this.pendingJoins.delete(roomId);
  }

  /**
   * Get all pending room IDs from Redis
   */
  async getRedisPendingRoomIds() {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, no pending rooms in Redis"
        );
        return [];
      }

      const keys = await this.redisClient.keys("bot_join_pending:*");
      return keys.map((key) => key.replace("bot_join_pending:", ""));
    } catch (error) {
      this.logger.error(
        "[RoomWatcher] Error getting Redis pending room IDs:",
        error
      );
      return [];
    }
  }

  /**
   * Clean up expired pending joins
   */
  cleanupExpiredPendingJoins(now) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, no pending joins to clean up"
      );
      return;
    }

    const expiryTime = now - BOT_CONFIG.JOIN_DELAY_MS * 2; // 2x the join delay

    if (this.useRedis && this.redisClient) {
      // Redis handles expiry automatically
      return;
    }

    // In-memory cleanup
    for (const [roomId, data] of this.pendingJoins.entries()) {
      if (data.scheduledAt < expiryTime) {
        this.logger.warn(
          `[RoomWatcher] Clearing expired pending room ${roomId}`
        );
        this.pendingJoins.delete(roomId);
      }
    }
  }

  /**
   * Emit event for bot manager to handle
   */
  emitBotJoinPending(roomId, joinData) {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, not emitting bot join pending event"
      );
      return;
    }

    // This will be handled by the bot manager
    // For now, just log the event
    this.logger.info(
      `[RoomWatcher] Emitting bot_join_pending for room ${roomId}:`,
      {
        roomId,
        maxBotsAllowed: joinData.maxBotsAllowed,
        currentPlayerCount: joinData.currentPlayerCount,
      }
    );

    // TODO: Integrate with event system or bot manager
    // global.io.emit('bot_join_pending', { roomId, ...joinData });
  }

  /**
   * Get current status of the room watcher
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      sweepInterval: SWEEP_INTERVAL_MS,
      pendingJoinsCount: this.pendingJoins.size,
      useRedis: this.useRedis,
      botsEnabled: BOT_CONFIG.BOTS_ENABLED,
      botConfig: {
        joinDelayMs: BOT_CONFIG.JOIN_DELAY_MS,
        maxBotsPerGame: BOT_CONFIG.MAX_BOTS_PER_GAME,
      },
    };
  }

  /**
   * Get all pending joins (for debugging/monitoring)
   */
  getPendingJoins() {
    // Check if bots are enabled globally
    if (!BOT_CONFIG.BOTS_ENABLED) {
      this.logger.debug(
        "[RoomWatcher] Bots are disabled globally, no pending joins"
      );
      return [];
    }

    if (this.useRedis && this.redisClient) {
      // Return Redis pending joins
      return this.getRedisPendingJoins();
    } else {
      // Return in-memory pending joins
      return Array.from(this.pendingJoins.entries()).map(([roomId, data]) => ({
        roomId,
        ...data,
      }));
    }
  }

  /**
   * Get Redis pending joins
   */
  async getRedisPendingJoins() {
    try {
      // Check if bots are enabled globally
      if (!BOT_CONFIG.BOTS_ENABLED) {
        this.logger.debug(
          "[RoomWatcher] Bots are disabled globally, no pending joins in Redis"
        );
        return [];
      }

      const keys = await this.redisClient.keys("bot_join_pending:*");
      const pendingJoins = [];

      for (const key of keys) {
        const roomId = key.replace("bot_join_pending:", "");
        const data = await this.redisClient.get(key);
        if (data) {
          pendingJoins.push({
            roomId,
            ...JSON.parse(data),
          });
        }
      }

      return pendingJoins;
    } catch (error) {
      this.logger.error(
        "[RoomWatcher] Error getting Redis pending joins:",
        error
      );
      return [];
    }
  }
}

// Create singleton instance
const roomWatcher = new RoomWatcher();

module.exports = {
  RoomWatcher,
  roomWatcher,
};
