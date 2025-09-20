const { hasPlayerWon, getNextPosition, isSafePosition } = require("./utils");
const { paths } = require("../constants");

class RoomState {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.currentTurn = null;
    this.gameStatus = "waiting";
    this.dieStatus = "stopped";
    this.lastRoll = null;
    this.createdAt = Date.now();
    this.hostId = null;
    this.gameSettings = {};
    this.botsEnabled = false; // Bot decision made at game creation time
    this.gameState = {
      pieces: {
        green: ["gh1", "gh2", "gh3", "gh4"],
        blue: ["bh1", "bh2", "bh3", "bh4"],
      },
    };
    this.disconnectedPlayers = new Map();
    this.roomTimeout = null;
    this.roomDeletionTimeout = null;
    this.disconnectedAutoMoveTimers = new Map();
    this.autoMoveCount = new Map();
    this.turnTimeout = null; // Timer for turn timeout
    this.joinLock = false; // Simple in-memory lock for join operations
  }

  cleanup() {
    if (this.roomTimeout) {
      clearTimeout(this.roomTimeout);
      this.roomTimeout = null;
    }
    if (this.roomDeletionTimeout) {
      clearTimeout(this.roomDeletionTimeout);
      this.roomDeletionTimeout = null;
    }
    // Clear all auto-move timers
    this.disconnectedAutoMoveTimers.forEach((timer) => clearTimeout(timer));
    this.disconnectedAutoMoveTimers.clear();
    // Clear turn timeout
    if (this.turnTimeout) {
      clearTimeout(this.turnTimeout);
      this.turnTimeout = null;
    }
  }

  /**
   * Acquire join lock for this room
   * @returns {boolean} True if lock acquired, false if already locked
   */
  acquireJoinLock() {
    if (this.joinLock) {
      return false;
    }
    this.joinLock = true;
    return true;
  }

  /**
   * Release join lock for this room
   */
  releaseJoinLock() {
    this.joinLock = false;
  }
}

class GameManager {
  constructor() {
    this.rooms = new Map(); // roomId -> RoomState
    this.waitingRoomId = null;

    // Constants
    this.GAME_STATUS = {
      WAITING: "waiting",
      PLAYING: "playing",
      FINISHED: "finished",
    };

    this.DIE_STATUS = {
      STOPPED: "stopped",
      ROLLING: "rolling",
    };
  }

  // Room management methods
  createRoom(roomId, roomData) {
    const roomState = new RoomState(roomId);
    Object.assign(roomState, roomData);
    this.rooms.set(roomId, roomState);
    return roomState;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.cleanup();
      this.rooms.delete(roomId);
    }
    if (this.waitingRoomId === roomId) {
      this.waitingRoomId = null;
    }
  }

  setWaitingRoom(roomId) {
    this.waitingRoomId = roomId;
  }

  getWaitingRoom() {
    return this.waitingRoomId;
  }

  // Game state methods
  getGameState(roomId) {
    const room = this.rooms.get(roomId);
    return room ? room.gameState : null;
  }

  updateGameState(roomId, updates) {
    const room = this.rooms.get(roomId);
    if (room) {
      Object.assign(room.gameState, updates);
    }
  }

  // Player management methods
  addDisconnectedPlayer(roomId, playerId, playerData) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.disconnectedPlayers.set(playerId, playerData);
    }
  }

  removeDisconnectedPlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.disconnectedPlayers.delete(playerId);
    }
  }

  getDisconnectedPlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    return room ? room.disconnectedPlayers.get(playerId) : null;
  }

  // Timer management methods
  setRoomTimeout(roomId, timeoutId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.roomTimeout = timeoutId;
    }
  }

  setRoomDeletionTimeout(roomId, timeoutId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.roomDeletionTimeout = timeoutId;
    }
  }

  setAutoMoveTimer(roomId, playerId, timerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.disconnectedAutoMoveTimers.set(playerId, timerId);
    }
  }

  clearAutoMoveTimer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      const timer = room.disconnectedAutoMoveTimers.get(playerId);
      if (timer) {
        clearTimeout(timer);
        room.disconnectedAutoMoveTimers.delete(playerId);
      }
    }
  }

  // Bot management methods
  /**
   * Find and remove the last-joined bot player from a room
   * @param {string} roomId - Room ID
   * @returns {Object|null} Removed bot player or null if no bots found
   */
  removeLastJoinedBot(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Find the last-joined bot player
    const botPlayers = room.players.filter((p) => p.isBot);
    if (botPlayers.length === 0) return null;

    // Sort by joinedAt timestamp (newest first) and get the last one
    const sortedBots = botPlayers.sort(
      (a, b) => new Date(b.joinedAt || 0) - new Date(a.joinedAt || 0)
    );
    const lastJoinedBot = sortedBots[0];

    // Remove the bot from the players array
    const botIndex = room.players.findIndex((p) => p.id === lastJoinedBot.id);
    if (botIndex !== -1) {
      room.players.splice(botIndex, 1);

      // Clear any auto-move timers for this bot
      this.clearAutoMoveTimer(roomId, lastJoinedBot.id);

      return lastJoinedBot;
    }

    return null;
  }

  /**
   * Check if a room contains bot players
   * @param {string} roomId - Room ID
   * @returns {boolean} True if room contains bots
   */
  hasBotPlayers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.players.some((p) => p.isBot);
  }

  /**
   * Get the count of bot players in a room
   * @param {string} roomId - Room ID
   * @returns {number} Count of bot players
   */
  getBotPlayerCount(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return room.players.filter((p) => p.isBot).length;
  }

  /**
   * Get the count of human players in a room
   * @param {string} roomId - Room ID
   * @returns {number} Count of human players
   */
  getHumanPlayerCount(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return 0;
    return room.players.filter((p) => !p.isBot).length;
  }

  /**
   * Acquire join lock for a room to prevent multiple simultaneous joins
   * @param {string} roomId - Room ID
   * @returns {boolean} True if lock acquired, false if already locked
   */
  acquireJoinLock(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.acquireJoinLock();
  }

  /**
   * Release join lock for a room
   * @param {string} roomId - Room ID
   */
  releaseJoinLock(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.releaseJoinLock();
    }
  }

  /**
   * Check if a room has an active join lock
   * @param {string} roomId - Room ID
   * @returns {boolean} True if room is locked for joins
   */
  isJoinLocked(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.joinLock;
  }

  incrementAutoMoveCount(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      const currentCount = room.autoMoveCount.get(playerId) || 0;
      room.autoMoveCount.set(playerId, currentCount + 1);
      return currentCount + 1;
    }
    return 0;
  }

  getAutoMoveCount(roomId, playerId) {
    const room = this.rooms.get(roomId);
    return room ? room.autoMoveCount.get(playerId) || 0 : 0;
  }

  // Utility methods
  getAllRoomIds() {
    return Array.from(this.rooms.keys());
  }

  getRoomCount() {
    return this.rooms.size;
  }

  // Turn timeout methods
  setTurnTimeout(roomId, timeoutCallback, timeoutMs = 30000) {
    const room = this.getRoom(roomId);
    if (!room) return;

    // Clear existing timeout
    this.clearTurnTimeout(roomId);

    // Set new timeout
    room.turnTimeout = setTimeout(() => {
      timeoutCallback();
      room.turnTimeout = null;
    }, timeoutMs);
  }

  clearTurnTimeout(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return;

    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }
  }

  // Cleanup methods
  cleanupInactiveRooms(maxAge = 3600000) {
    // 1 hour default
    const now = Date.now();
    const roomsToDelete = [];

    for (const [roomId, room] of this.rooms) {
      if (now - room.createdAt > maxAge) {
        roomsToDelete.push(roomId);
      }
    }

    roomsToDelete.forEach((roomId) => {
      this.deleteRoom(roomId);
    });

    return roomsToDelete.length;
  }
}

// Create singleton instance
const gameManager = new GameManager();

// Export utility functions and the manager
module.exports = {
  gameManager,
  hasPlayerWon,
  getNextPosition,
  isSafePosition,
};
