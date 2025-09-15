const {
  getMovableTokens,
  getNextPosition,
  isSafePosition,
} = require("../utils");
const { getBotConfigSync } = require("./config");
const { gameManager } = require("../gameManager");
const { HardAI } = require("./ai/hard");

// Configuration
const BOT_CONFIG = getBotConfigSync();

/**
 * Bot Controller Class - Handles bot turns in the game
 */
class BotController {
  constructor(options = {}) {
    this.io = options.io || null;
    this.logger = options.logger || console;
    this.activeBots = new Map(); // roomId -> Set of bot player IDs
    this.botTimers = new Map(); // roomId -> Map of botId -> timer
    this.hardAI = new HardAI(); // Instance of HardAI for hard difficulty bots
    this.botRollCounts = new Map(); // roomId -> Map of botId -> rollCount

    // Bind methods
    this.handleGameStart = this.handleGameStart.bind(this);
    this.handleTurnChange = this.handleTurnChange.bind(this);
    this.handleGameEnd = this.handleGameEnd.bind(this);
    this.scheduleBotTurn = this.scheduleBotTurn.bind(this);
    this.executeBotTurn = this.executeBotTurn.bind(this);
    this.rollDiceForBot = this.rollDiceForBot.bind(this);
    this.makeBotMove = this.makeBotMove.bind(this);
    this.evaluateLegalMoves = this.evaluateLegalMoves.bind(this);
    this.selectBestMove = this.selectBestMove.bind(this);
    this.cleanupBotTimers = this.cleanupBotTimers.bind(this);
  }

  /**
   * Initialize the bot controller with Socket.io instance
   * @param {Object} io - Socket.io instance
   */
  initialize(io) {
    this.io = io;
    this.logger.info("[BotController] Initialized with Socket.io instance");
    this.logger.info("[BotController] IO instance details:", {
      hasIo: !!this.io,
      ioType: typeof this.io,
      hasEmit: !!(this.io && this.io.emit),
      hasTo: !!(this.io && this.io.to),
    });
  }

  /**
   * Determine if the bot should get another turn based on game rules
   * @param {Object} room - Room state
   * @param {string} botId - Bot player ID
   * @param {Object} moveResult - Result of the bot's move
   * @returns {boolean} True if bot should get another turn
   */
  shouldBotGetAnotherTurn(room, botId, moveResult) {
    try {
      if (!room.lastRoll) return false;

      const rollValue = room.lastRoll.value;
      const botPlayer = room.players.find((p) => p.id === botId);
      if (!botPlayer) return false;

      // Check if move was successful
      if (!moveResult || !moveResult.success) {
        console.log(
          `[BotController] Bot ${botPlayer.name} does not get another turn because move failed`
        );
        return false;
      }

      // Rule 1: Rolled a 6 - always get another turn
      if (rollValue === 6) {
        console.log(
          `[BotController] Bot ${botPlayer.name} gets another turn because they rolled a 6`
        );
        return true;
      }

      // Rule 2: Killed a piece - get another turn
      if (moveResult.killedPiece) {
        console.log(
          `[BotController] Bot ${botPlayer.name} gets another turn because they killed a piece`
        );
        return true;
      }

      // Rule 3: Landed in win zone - get another turn
      if (moveResult.isWinZone) {
        console.log(
          `[BotController] Bot ${botPlayer.name} gets another turn because they landed in win zone`
        );
        return true;
      }

      // Rule 4: Brought out a piece from home (on roll of 6) - get another turn
      if (rollValue === 6 && moveResult.isHome) {
        console.log(
          `[BotController] Bot ${botPlayer.name} gets another turn because they brought out a piece from home`
        );
        return true;
      }

      console.log(
        `[BotController] Bot ${botPlayer.name} does not get another turn`
      );
      return false;
    } catch (error) {
      this.logger.error(
        `[BotController] Error determining if bot should get another turn:`,
        error
      );
      return false;
    }
  }

  /**
   * Normalize player data to ensure all players have required fields
   * @param {Array} players - Array of players
   * @returns {Array} Normalized players array
   */
  normalizePlayers(players) {
    return players.map((player) => {
      // Ensure isBot field is set (default to false if not present)
      if (player.isBot === undefined) {
        player.isBot = false;
      }
      return player;
    });
  }

  /**
   * Handle game start - initialize bot tracking for the room
   * @param {string} roomId - Room ID
   */
  handleGameStart(roomId) {
    try {
      // Check if bots are enabled for this specific room
      const room = gameManager.getRoom(roomId);
      if (!room || !room.botsEnabled) {
        console.log(
          `[BotController] Bots are disabled for room ${roomId}, skipping game start handling`
        );
        return;
      }

      this.logger.info(
        `[BotController] Game start detected for room ${roomId}`
      );
      console.log(`[BotController] ====== handleGameStart CALLED ======`);
      console.log(`[BotController] Room ID: ${roomId}`);
      console.log(`[BotController] This object:`, this);
      console.log(
        `[BotController] This.handleGameStart:`,
        typeof this.handleGameStart
      );

      // Normalize player data to ensure all players have required fields
      const normalizedPlayers = this.normalizePlayers(room.players);
      this.logger.info(
        `[BotController] Room ${roomId} found for game start, normalized players:`,
        normalizedPlayers.map((p) => ({
          id: p.id,
          name: p.name,
          isBot: p.isBot,
        }))
      );

      // Identify bot players in the room
      const botPlayers = normalizedPlayers.filter((p) => p.isBot);
      this.logger.info(
        `[BotController] Found ${botPlayers.length} bot players in room ${roomId}:`,
        botPlayers.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot }))
      );

      if (botPlayers.length === 0) {
        this.logger.info(`[BotController] No bots in room ${roomId}`);
        return;
      }

      // Track active bots for this room
      this.activeBots.set(roomId, new Set(botPlayers.map((p) => p.id)));
      this.botTimers.set(roomId, new Map());

      // Initialize roll counts for bot players
      const rollCounts = new Map();
      botPlayers.forEach((bot) => rollCounts.set(bot.id, 0));
      this.botRollCounts.set(roomId, rollCounts);

      this.logger.info(
        `[BotController] Game started in room ${roomId} with ${botPlayers.length} bots`
      );
      this.emitBotActionLog(roomId, "game_start", {
        botCount: botPlayers.length,
      });

      // If the first player is a bot, schedule their turn
      if (normalizedPlayers[0] && normalizedPlayers[0].isBot) {
        this.logger.info(
          `[BotController] First player is a bot, scheduling their turn`
        );
        this.scheduleBotTurn(roomId, normalizedPlayers[0].id);
      } else {
        this.logger.info(
          `[BotController] First player is not a bot, no need to schedule bot turn`
        );
      }
    } catch (error) {
      this.logger.error(
        `[BotController] Error handling game start for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Handle turn change - check if it's a bot's turn
   * @param {string} roomId - Room ID
   * @param {string} currentTurn - Current player's ID
   */
  handleTurnChange(roomId, currentTurn) {
    try {
      // Check if bots are enabled for this specific room
      const room = gameManager.getRoom(roomId);
      if (!room || !room.botsEnabled) {
        console.log(
          `[BotController] Bots are disabled for room ${roomId}, skipping turn change handling`
        );
        return;
      }

      console.log(`[BotController] ====== handleTurnChange CALLED ======`);
      console.log(
        `[BotController] Room ID: ${roomId}, Current Turn: ${currentTurn}`
      );
      console.log(`[BotController] This object:`, this);
      console.log(
        `[BotController] This.handleTurnChange:`,
        typeof this.handleTurnChange
      );

      this.logger.info(
        `[BotController] Turn change detected for room ${roomId}, currentTurn: ${currentTurn}`
      );

      // Normalize player data to ensure all players have required fields
      const normalizedPlayers = this.normalizePlayers(room.players);
      this.logger.info(
        `[BotController] Room ${roomId} found for game start, normalized players:`,
        normalizedPlayers.map((p) => ({
          id: p.id,
          name: p.name,
          isBot: p.isBot,
        }))
      );

      const currentPlayer = normalizedPlayers.find((p) => p.id === currentTurn);
      if (!currentPlayer) {
        this.logger.warn(
          `[BotController] Current player ${currentTurn} not found in room ${roomId}`
        );
        return;
      }

      this.logger.info(`[BotController] Current player:`, {
        id: currentPlayer.id,
        name: currentPlayer.name,
        isBot: currentPlayer.isBot,
      });

      if (currentPlayer && currentPlayer.isBot) {
        this.logger.info(
          `[BotController] Bot ${currentPlayer.name}'s turn in room ${roomId}`
        );
        console.log(
          `[BotController] About to call scheduleBotTurn for bot ${currentPlayer.name}`
        );

        // Add additional validation to ensure bot turn is properly scheduled
        if (
          this.scheduleBotTurn &&
          typeof this.scheduleBotTurn === "function"
        ) {
          console.log(
            `[BotController] scheduleBotTurn method is available, calling it...`
          );
          console.log(
            `[BotController] About to schedule turn for bot ${currentPlayer.name} (ID: ${currentTurn}) in room ${roomId}`
          );
          this.scheduleBotTurn(roomId, currentTurn);
          console.log(
            `[BotController] scheduleBotTurn called successfully for bot ${currentPlayer.name}`
          );
        } else {
          console.error(
            `[BotController] ERROR: scheduleBotTurn method not available!`
          );
          this.logger.error(
            `[BotController] scheduleBotTurn method not available for bot ${currentPlayer.name}`
          );

          // Fallback: directly execute bot turn if scheduling fails
          console.log(
            `[BotController] Fallback: directly executing bot turn for ${currentPlayer.name}`
          );
          setTimeout(() => {
            this.executeBotTurn(roomId, currentTurn);
          }, 1000);
        }
      } else {
        this.logger.info(
          `[BotController] Human player ${currentPlayer.name}'s turn in room ${roomId}`
        );
      }
    } catch (error) {
      this.logger.error(
        `[BotController] Error handling turn change for room ${roomId}:`,
        error
      );
      console.error(`[BotController] Error in handleTurnChange:`, error);
    }
  }

  /**
   * Handle game end - cleanup bot timers and state
   * @param {string} roomId - Room ID
   */
  handleGameEnd(roomId) {
    try {
      // Check if bots are enabled for this specific room
      const room = gameManager.getRoom(roomId);
      if (!room || !room.botsEnabled) {
        console.log(
          `[BotController] Bots are disabled for room ${roomId}, skipping game end handling`
        );
        return;
      }

      this.cleanupBotTimers(roomId);
      this.activeBots.delete(roomId);
      this.botRollCounts.delete(roomId);
      this.logger.info(
        `[BotController] Game ended in room ${roomId}, cleaned up bot state`
      );
    } catch (error) {
      this.logger.error(
        `[BotController] Error handling game end for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Schedule a bot's turn with reaction delay
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   */
  scheduleBotTurn(roomId, botId) {
    try {
      // Check if bots are enabled for this specific room
      const room = gameManager.getRoom(roomId);
      if (!room || !room.botsEnabled) {
        console.log(
          `[BotController] Bots are disabled for room ${roomId}, skipping bot turn scheduling`
        );
        return;
      }

      console.log(`[BotController] ====== scheduleBotTurn CALLED ======`);
      console.log(
        `[BotController] scheduleBotTurn - Room ID: ${roomId}, Bot ID: ${botId}`
      );
      this.logger.info(
        `[BotController] scheduleBotTurn called for room ${roomId}, bot ${botId}`
      );

      // Normalize player data to ensure all players have required fields
      const normalizedPlayers = this.normalizePlayers(room.players);
      const botPlayer = normalizedPlayers.find((p) => p.id === botId);
      if (!botPlayer || !botPlayer.isBot) {
        this.logger.warn(
          `[BotController] Bot player ${botId} not found or not a bot in scheduleBotTurn`
        );
        console.log(
          `[BotController] ERROR: Bot player ${botId} not found or not a bot in scheduleBotTurn`
        );
        console.log(`[BotController] Found player:`, botPlayer);
        return;
      }

      // Calculate reaction delay based on bot difficulty
      const baseDelay = BOT_CONFIG.MOVE_DELAY_MS;
      const reactionDelay = this.calculateReactionDelay(
        botPlayer.difficulty,
        baseDelay
      );

      console.log(
        `[BotController] Base delay: ${baseDelay}ms, Calculated delay: ${reactionDelay}ms`
      );
      this.logger.info(
        `[BotController] Scheduling bot ${botPlayer.name}'s turn in room ${roomId} with ${reactionDelay}ms delay`
      );

      // Clear any existing timer for this bot
      this.clearBotTimer(roomId, botId);

      // Schedule the bot turn
      console.log(
        `[BotController] Setting timer for ${reactionDelay}ms for bot ${botPlayer.name}`
      );
      const timer = setTimeout(() => {
        console.log(`[BotController] ====== TIMER CALLBACK EXECUTED ======`);
        console.log(
          `[BotController] Timer expired, executing bot turn for ${botPlayer.name} in room ${roomId}`
        );
        this.logger.info(
          `[BotController] Timer expired, executing bot turn for ${botPlayer.name} in room ${roomId}`
        );

        // Add additional validation before executing bot turn
        if (this.executeBotTurn && typeof this.executeBotTurn === "function") {
          console.log(
            `[BotController] executeBotTurn method is available, calling it...`
          );
          this.executeBotTurn(roomId, botId);
        } else {
          console.error(
            `[BotController] ERROR: executeBotTurn method not available!`
          );
          this.logger.error(
            `[BotController] executeBotTurn method not available for bot ${botPlayer.name}`
          );
        }
      }, reactionDelay);

      // Store the timer
      const roomTimers = this.botTimers.get(roomId) || new Map();
      roomTimers.set(botId, timer);
      this.botTimers.set(roomId, roomTimers);

      console.log(
        `[BotController] Timer stored successfully. Room timers:`,
        this.botTimers.get(roomId)
      );
      console.log(
        `[BotController] Active timers for room ${roomId}:`,
        Array.from(roomTimers.keys())
      );

      this.logger.info(
        `[BotController] Bot turn scheduled successfully for ${botPlayer.name} in room ${roomId}`
      );

      this.emitBotActionLog(roomId, "turn_scheduled", {
        botId,
        botName: botPlayer.name,
        delay: reactionDelay,
        difficulty: botPlayer.difficulty,
      });
    } catch (error) {
      this.logger.error(
        `[BotController] Error scheduling bot turn for room ${roomId}, bot ${botId}:`,
        error
      );
      console.error(`[BotController] Error in scheduleBotTurn:`, error);
    }
  }

  /**
   * Execute a bot's turn (roll dice, evaluate moves, make move)
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   */
  async executeBotTurn(roomId, botId) {
    try {
      // Check if bots are enabled for this specific room
      const room = gameManager.getRoom(roomId);
      if (!room || !room.botsEnabled) {
        console.log(
          `[BotController] Bots are disabled for room ${roomId}, skipping bot turn execution`
        );
        return;
      }

      console.log(`[BotController] ====== executeBotTurn CALLED ======`);
      console.log(`[BotController] Room ID: ${roomId}, Bot ID: ${botId}`);
      this.logger.info(
        `[BotController] executeBotTurn called for room ${roomId}, bot ${botId}`
      );

      // Normalize player data to ensure all players have required fields
      const normalizedPlayers = this.normalizePlayers(room.players);
      const botPlayer = normalizedPlayers.find((p) => p.id === botId);
      if (!botPlayer || !botPlayer.isBot) {
        this.logger.warn(
          `[BotController] Bot player ${botId} not found or not a bot in executeBotTurn`
        );
        return;
      }

      this.logger.info(
        `[BotController] Executing bot ${botPlayer.name}'s turn in room ${roomId}`
      );

      // Check if it's still the bot's turn
      if (room.currentTurn !== botId) {
        this.logger.info(
          `[BotController] Bot ${botPlayer.name} is no longer the current turn in room ${roomId}. Current turn: ${room.currentTurn}`
        );
        return;
      }

      // Check if game is still playing
      if (room.gameStatus !== gameManager.GAME_STATUS.PLAYING) {
        this.logger.info(
          `[BotController] Game in room ${roomId} is no longer playing. Status: ${room.gameStatus}`
        );
        return;
      }

      this.logger.info(
        `[BotController] Starting bot turn execution for ${botPlayer.name} in room ${roomId}`
      );

      // Step 1: Roll dice for the bot
      this.logger.info(
        `[BotController] Step 1: Rolling dice for bot ${botPlayer.name}`
      );
      const rollResult = await this.rollDiceForBot(roomId, botId);
      if (!rollResult) {
        this.logger.warn(
          `[BotController] Failed to roll dice for bot ${botPlayer.name} in room ${roomId}`
        );
        return;
      }

      this.logger.info(
        `[BotController] Dice rolled successfully for bot ${botPlayer.name}: ${rollResult.value}`
      );

      // Step 2: Wait a small delay after rolling
      this.logger.info(
        `[BotController] Step 2: Waiting ${BOT_CONFIG.DICE_ROLL_DELAY_MS}ms after rolling`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, BOT_CONFIG.DICE_ROLL_DELAY_MS)
      );

      // Step 3: Evaluate legal moves and make the best move
      this.logger.info(
        `[BotController] Step 3: Evaluating moves and making move for bot ${botPlayer.name}`
      );
      const moveResult = await this.makeBotMove(
        roomId,
        botId,
        rollResult.value
      );
      if (!moveResult) {
        this.logger.warn(
          `[BotController] Failed to make move for bot ${botPlayer.name} in room ${roomId}`
        );

        // Advance turn to next player since bot couldn't make a move
        const currentRoom = gameManager.getRoom(roomId);
        if (
          currentRoom &&
          currentRoom.players &&
          currentRoom.players.length > 0
        ) {
          const currentPlayerIndex = currentRoom.players.findIndex(
            (p) => p.id === botId
          );
          const nextIndex =
            (currentPlayerIndex + 1) % currentRoom.players.length;
          const oldTurn = currentRoom.currentTurn;
          currentRoom.currentTurn = currentRoom.players[nextIndex].id;

          console.log(
            `[BotController] Turn advanced from ${oldTurn} to ${currentRoom.currentTurn} because bot couldn't make a move`
          );

          // Emit room update with new turn
          if (this.io) {
            this.io.to(roomId).emit("room_update", {
              players: currentRoom.players,
              currentTurn: currentRoom.currentTurn,
              gameStatus: currentRoom.gameStatus,
              lastRoll: currentRoom.lastRoll,
            });
          }

          // Notify bot controller about turn change
          this.handleTurnChange(roomId, room.currentTurn);
        }
      } else {
        this.logger.info(
          `[BotController] Bot ${botPlayer.name} successfully completed their turn in room ${roomId}`
        );

        // Check if bot should get another turn
        const currentRoom = gameManager.getRoom(roomId);
        if (currentRoom && currentRoom.lastRoll) {
          const shouldGetAnotherTurn = this.shouldBotGetAnotherTurn(
            currentRoom,
            botId,
            moveResult
          );

          if (shouldGetAnotherTurn) {
            console.log(
              `[BotController] Bot ${botPlayer.name} gets another turn!`
            );
            // Schedule another bot turn immediately
            setTimeout(() => {
              this.scheduleBotTurn(roomId, botId);
            }, 1000); // 1 second delay before next turn
          } else {
            console.log(
              `[BotController] Bot ${botPlayer.name} turn complete, advancing to next player`
            );
            // Advance turn to next player
            const currentPlayerIndex = room.players.findIndex(
              (p) => p.id === botId
            );
            const nextIndex = (currentPlayerIndex + 1) % room.players.length;
            const oldTurn = room.currentTurn;
            room.currentTurn = room.players[nextIndex].id;

            console.log(
              `[BotController] Turn advanced from ${oldTurn} to ${room.currentTurn}`
            );

            // Emit room update with new turn
            if (this.io) {
              this.io.to(roomId).emit("room_update", {
                players: room.players,
                currentTurn: room.currentTurn,
                gameStatus: room.gameStatus,
                lastRoll: room.lastRoll,
              });
            }

            // Notify bot controller about turn change
            this.handleTurnChange(roomId, room.currentTurn);
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `[BotController] Error executing bot turn for room ${roomId}, bot ${botId}:`,
        error
      );
      this.emitBotActionLog(roomId, "turn_error", {
        botId,
        error: error.message,
      });
    }
  }

  /**
   * Roll dice for a bot player
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   * @returns {Promise<Object|null>} Roll result or null if failed
   */
  async rollDiceForBot(roomId, botId) {
    try {
      const room = gameManager.getRoom(roomId);
      if (!room) return null;

      const botPlayer = room.players.find((p) => p.id === botId);
      if (!botPlayer || !botPlayer.isBot) return null;

      this.logger.info(
        `[BotController] Rolling dice for bot ${botPlayer.name} in room ${roomId}`
      );

      // Emit rolling dice event
      this.io.to(roomId).emit("rolling_dice", { playerId: botId });

      // Wait for rolling animation
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Get game state and roll dice
      const gameState = gameManager.getGameState(roomId);
      const playerColor = botPlayer.color;

      // Check if this is the bot's first roll (all pieces are in home)
      const isFirstRoll = !gameState.pieces[playerColor]?.some(
        (piece) => piece && !piece.startsWith(`${playerColor[0]}h`)
      );

      let value;
      if (isFirstRoll) {
        // First roll: always roll 6 to ensure bot can move
        value = 6;
        console.log(
          `[BotController] First roll for bot ${botPlayer.name}, forcing value 6`
        );
      } else {
        // Subsequent rolls: use strategic roll logic
        value = this.getStrategicBotRollValue(
          roomId,
          botId,
          gameState.pieces,
          playerColor
        );
        console.log(
          `[BotController] Strategic roll for bot ${botPlayer.name}: ${value}`
        );
      }

      // Update room state
      room.lastRoll = {
        value,
        roller: botId,
        moved: false,
      };

      // Emit roll result (same events as human players)
      this.io.to(roomId).emit("roll_dice", {
        value,
        roller: botId,
        dieStatus: gameManager.DIE_STATUS.ROLLING,
      });

      this.emitBotActionLog(roomId, "dice_rolled", {
        botId,
        botName: botPlayer.name,
        value,
        color: playerColor,
      });

      return { value, color: playerColor };
    } catch (error) {
      this.logger.error(
        `[BotController] Error rolling dice for bot ${botId} in room ${roomId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Make a move for a bot player
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   * @param {number} rollValue - Dice roll value
   * @returns {Promise<boolean>} Success status
   */
  async makeBotMove(roomId, botId, rollValue) {
    try {
      const room = gameManager.getRoom(roomId);
      if (!room) return false;

      const botPlayer = room.players.find((p) => p.id === botId);
      if (!botPlayer || !botPlayer.isBot) return false;

      this.logger.info(
        `[BotController] Making move for bot ${botPlayer.name} in room ${roomId} with roll ${rollValue}`
      );

      // Evaluate legal moves
      console.log(
        `[BotController] Evaluating legal moves for bot ${botPlayer.name} with roll ${rollValue}`
      );
      const legalMoves = this.evaluateLegalMoves(
        roomId,
        botPlayer.color,
        rollValue
      );

      console.log(
        `[BotController] Found ${legalMoves.length} legal moves for bot ${botPlayer.name}`
      );

      if (legalMoves.length === 0) {
        this.logger.info(
          `[BotController] No legal moves for bot ${botPlayer.name} with roll ${rollValue}`
        );
        this.emitBotActionLog(roomId, "no_legal_moves", {
          botId,
          botName: botPlayer.name,
          rollValue,
          color: botPlayer.color,
        });
        return false;
      }

      // Select the best move
      console.log(
        `[BotController] Selecting best move from ${legalMoves.length} legal moves for bot ${botPlayer.name}`
      );

      let selectedMove;
      if (botPlayer.difficulty === "hard" && room.gameState) {
        // Use HardAI for hard difficulty bots
        try {
          const hardAIMove = this.hardAI.chooseMove(
            room.gameState,
            botId,
            rollValue
          );

          if (hardAIMove) {
            // Convert HardAI move format to our move format
            selectedMove = legalMoves.find(
              (move) => move.pieceIndex === hardAIMove.pieceIndex
            );
          }
        } catch (error) {
          // If HardAI fails, fall back to default selection
          this.logger.warn(
            `[BotController] HardAI failed for bot ${botId}, falling back to default selection:`,
            error.message
          );
        }
      }

      // Fallback to default selection if HardAI didn't return a move or for other difficulties
      if (!selectedMove) {
        selectedMove = this.selectBestMove(
          legalMoves,
          botPlayer.difficulty,
          roomId,
          botPlayer.color
        );
      }

      if (!selectedMove) {
        console.error(
          `[BotController] ERROR: No move selected for bot ${botPlayer.name} despite having ${legalMoves.length} legal moves`
        );
        return false;
      }

      this.logger.info(
        `[BotController] Bot ${botPlayer.name} selected move: piece ${selectedMove.pieceIndex} to ${selectedMove.nextPosition}`
      );

      // Execute the move using the existing move_piece logic
      const moveResult = await this.executeBotMove(roomId, botId, selectedMove);

      if (moveResult) {
        this.emitBotActionLog(roomId, "move_made", {
          botId,
          botName: botPlayer.name,
          pieceIndex: selectedMove.pieceIndex,
          fromPosition: selectedMove.currentPosition,
          toPosition: selectedMove.nextPosition,
          rollValue,
          color: botPlayer.color,
        });
      }

      return moveResult;
    } catch (error) {
      this.logger.error(
        `[BotController] Error making move for bot ${botId} in room ${roomId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Evaluate legal moves for a bot player
   * @param {string} roomId - Room ID
   * @param {string} color - Player color
   * @param {number} rollValue - Dice roll value
   * @returns {Array} Array of legal moves
   */
  evaluateLegalMoves(roomId, color, rollValue) {
    try {
      const gameState = gameManager.getGameState(roomId);
      if (!gameState || !gameState.pieces[color]) return [];

      const pieces = gameState.pieces[color];
      console.log(
        `[BotController] Evaluating legal moves for color ${color} with roll ${rollValue} in room ${roomId}`
      );
      console.log(`[BotController] Pieces for color ${color}:`, pieces);

      const legalMoves = [];

      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (!piece) continue;

        // Skip if piece has already won
        if (piece === `${color}WinZone`) continue;

        // Get next position for this piece
        const nextPosition = getNextPosition(piece, rollValue, color);
        console.log(
          `[BotController] Piece ${i} at position ${piece}, next position with roll ${rollValue}: ${nextPosition}`
        );

        if (nextPosition) {
          legalMoves.push({
            pieceIndex: i,
            currentPosition: piece,
            nextPosition,
            isSafe: isSafePosition(nextPosition),
            isHome: piece.startsWith(`${color[0]}h`),
            isWinZone: nextPosition === `${color}WinZone`,
          });
        }
      }

      console.log(
        `[BotController] Found ${legalMoves.length} legal moves for color ${color} with roll ${rollValue}`
      );
      return legalMoves;
    } catch (error) {
      this.logger.error(
        `[BotController] Error evaluating legal moves for color ${color} in room ${roomId}:`,
        error
      );
      return [];
    }
  }

  /**
   * Select the best move based on bot difficulty
   * @param {Array} legalMoves - Array of legal moves
   * @param {string} difficulty - Bot difficulty level
   * @param {string} roomId - Room ID for checking killing moves
   * @param {string} botColor - Bot's color for checking killing moves
   * @returns {Object} Selected move
   */
  selectBestMove(
    legalMoves,
    difficulty = "hard",
    roomId = null,
    botColor = null
  ) {
    if (legalMoves.length === 0) return null;
    if (legalMoves.length === 1) return legalMoves[0];

    // Sort moves by priority based on difficulty
    const sortedMoves = [...legalMoves].sort((a, b) => {
      // Priority 1: Winning moves
      if (a.isWinZone && !b.isWinZone) return -1;
      if (!a.isWinZone && b.isWinZone) return 1;

      // Priority 2: Killing opponent pieces (high priority for aggressive play)
      // Only check killing moves if we have roomId and botColor
      if (roomId && botColor) {
        const aCanKill = this.canKillOpponentPiece(
          roomId,
          a.nextPosition,
          botColor
        );
        const bCanKill = this.canKillOpponentPiece(
          roomId,
          b.nextPosition,
          botColor
        );
        if (aCanKill && !bCanKill) return -1;
        if (!aCanKill && bCanKill) return 1;
      }

      // Priority 3: Moving out of home (but consider required pieces strategy)
      if (roomId && botColor) {
        const room = gameManager.getRoom(roomId);
        const requiredPieces = room?.gameSettings?.requiredPieces || 2;
        const gameState = gameManager.getGameState(roomId);

        let shouldPrioritizeAdvancement = false;
        if (gameState && gameState.pieces) {
          shouldPrioritizeAdvancement = this.shouldPrioritizeAdvancement(
            gameState.pieces,
            botColor,
            requiredPieces
          );
          console.log(
            `[BotController] Move priority: ${
              shouldPrioritizeAdvancement ? "ADVANCE" : "BRING_OUT"
            } for ${botColor} (${requiredPieces} required pieces)`
          );
        }

        if (shouldPrioritizeAdvancement) {
          // Prioritize advancing existing tokens over bringing out new ones
          if (!a.isHome && b.isHome) return -1;
          if (a.isHome && !b.isHome) return 1;
        } else {
          // Default behavior: prioritize bringing out tokens
          if (a.isHome && !b.isHome) return -1;
          if (!a.isHome && b.isHome) return 1;
        }
      } else {
        // Fallback to default behavior if room info not available
        if (a.isHome && !b.isHome) return -1;
        if (!a.isHome && b.isHome) return 1;
      }

      // Priority 4: Safe positions
      if (a.isSafe && !b.isSafe) return -1;
      if (!a.isSafe && b.isSafe) return 1;

      // For higher difficulties, add more sophisticated logic
      if (difficulty === "hard") {
        // Add strategic considerations here
        // For now, just random selection
        return Math.random() - 0.5;
      }

      return 0;
    });

    // For easy difficulty, add some randomness
    if (difficulty === "easy" && Math.random() < 0.3) {
      const randomIndex = Math.floor(Math.random() * legalMoves.length);
      return legalMoves[randomIndex];
    }

    return sortedMoves[0];
  }

  /**
   * Execute a bot move using the existing game logic
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   * @param {Object} move - Move object
   * @returns {Promise<boolean>} Success status
   */
  async executeBotMove(roomId, botId, move) {
    try {
      console.log(`[BotController] ====== executeBotMove CALLED ======`);
      console.log(`[BotController] Room ID: ${roomId}, Bot ID: ${botId}`);
      console.log(`[BotController] Move details:`, move);

      const room = gameManager.getRoom(roomId);
      if (!room) {
        console.error(
          `[BotController] Room ${roomId} not found in executeBotMove`
        );
        return false;
      }

      const botPlayer = room.players.find((p) => p.id === botId);
      if (!botPlayer || !botPlayer.isBot) {
        console.error(
          `[BotController] Bot player ${botId} not found or not a bot in executeBotMove`
        );
        return false;
      }

      // Validate the move using existing logic
      const gameState = gameManager.getGameState(roomId);
      const piece = gameState.pieces[botPlayer.color][move.pieceIndex];

      if (piece !== move.currentPosition) {
        this.logger.warn(
          `[BotController] Piece position changed for bot ${botPlayer.name} in room ${roomId}`
        );
        return false;
      }

      // Apply the move
      console.log(
        `[BotController] Applying move: piece ${move.pieceIndex} from ${move.currentPosition} to ${move.nextPosition}`
      );
      gameState.pieces[botPlayer.color][move.pieceIndex] = move.nextPosition;
      room.lastRoll.moved = true;
      console.log(
        `[BotController] Move applied successfully. New piece position: ${
          gameState.pieces[botPlayer.color][move.pieceIndex]
        }`
      );

      // Check for piece completion
      if (move.nextPosition === `${botPlayer.color}WinZone`) {
        this.io.to(roomId).emit("piece_finished", {
          color: botPlayer.color,
          pieceIndex: move.pieceIndex,
        });
      }

      // Check if piece killed an opponent piece
      let killedPiece = null;
      Object.entries(gameState.pieces).forEach(([pieceColor, pieces]) => {
        if (pieceColor === botPlayer.color) return;
        const killedIndex = pieces.indexOf(move.nextPosition);
        if (killedIndex !== -1 && !isSafePosition(move.nextPosition)) {
          killedPiece = {
            color: pieceColor,
            index: killedIndex,
            position: move.nextPosition,
          };
          // Send the killed piece back to home
          gameState.pieces[pieceColor][killedIndex] = `${pieceColor[0]}h${
            killedIndex + 1
          }`;

          // Emit piece killed event
          this.io.to(roomId).emit("piece_killed", {
            color: pieceColor,
            pieceIndex: killedIndex,
            currentPosition: move.nextPosition,
          });

          console.log(
            `[BotController] Bot ${botPlayer.name} killed ${pieceColor} piece ${killedIndex} at position ${move.nextPosition}`
          );
        }
      });

      // Check for game completion
      const { hasPlayerWon } = require("../utils");
      if (
        hasPlayerWon(
          gameState.pieces,
          botPlayer.color,
          room.gameSettings.requiredPieces
        )
      ) {
        room.gameStatus = gameManager.GAME_STATUS.FINISHED;

        // Find the human player (loser)
        const humanPlayer = room.players.find((p) => !p.isBot);

        // Save game history to database
        try {
          const GameHistory = require("../../model/GameHistory");
          await GameHistory.create({
            user: humanPlayer?.userId || humanPlayer?.id,
            roomId,
            status: gameManager.GAME_STATUS.FINISHED,
            players: room.players,
            winnerId: botId,
            stake: room.gameSettings.stake,
            requiredPieces: room.gameSettings.requiredPieces,
            createdAt: new Date(),
          });
          console.log(
            `[BotController] Game history saved for bot win in room ${roomId}`
          );
        } catch (error) {
          console.error(
            `[BotController] Error saving game history for bot win in room ${roomId}:`,
            error
          );
        }

        // No wallet update needed for bot wins - human player already lost their stake when game started
        // Only humans get winnings when they beat bots, but when bots win, no additional wallet changes occur
        console.log(
          `[BotController] Bot ${botPlayer.name} won against human ${humanPlayer.name}. Human player lost their stake but no additional wallet updates needed.`
        );

        // Create detailed match results for bot win
        const matchResults = {
          winner: {
            id: botId,
            name: botPlayer.name,
            color: botPlayer.color,
            pieces: gameState.pieces[botPlayer.color],
            isBot: true,
          },
          loser: {
            id: humanPlayer.id,
            name: humanPlayer.name,
            color: humanPlayer.color,
            pieces: gameState.pieces[humanPlayer.color],
            isBot: false,
          },
          gameDuration: Date.now() - room.createdAt,
          requiredPieces: room.gameSettings.requiredPieces,
          stake: room.gameSettings.stake,
        };

        this.io.to(roomId).emit("game_over", matchResults);

        // Notify bot controller about game end
        this.handleGameEnd(roomId);

        return {
          success: true,
          isWinZone: move.nextPosition === `${botPlayer.color}WinZone`,
          killedPiece: killedPiece,
          isHome: move.isHome,
        };
      }

      // Advance turn if needed (this will be handled by the calling method now)
      // if (
      //   room.lastRoll.value !== 6 &&
      //   move.nextPosition !== `${botPlayer.color}WinZone`
      // ) {
      //   const nextIndex =
      //     (room.players.findIndex((p) => p.id === botId) + 1) %
      //     room.players.length;
      //   room.currentTurn = room.players[nextIndex].id;
      // }

      // Emit move events
      this.io.to(roomId).emit("piece_moved", {
        pieces: gameState.pieces,
        color: botPlayer.color,
        index: move.pieceIndex,
        fromPosition: move.currentPosition,
        toPosition: move.nextPosition,
      });

      // Check if bot should get another turn (rolled 6 or killed a piece)
      const shouldGetAnotherTurn = this.shouldBotGetAnotherTurn(room, botId, {
        success: true,
        killedPiece: killedPiece,
        isWinZone: move.nextPosition === `${botPlayer.color}WinZone`,
        isHome: move.isHome,
      });

      if (shouldGetAnotherTurn) {
        console.log(
          `[BotController] Bot ${botPlayer.name} gets another turn! (rolled ${
            room.lastRoll.value
          }${killedPiece ? " and killed a piece" : ""})`
        );
        // Schedule another bot turn immediately
        setTimeout(() => {
          this.scheduleBotTurn(roomId, botId);
        }, 1000); // 1 second delay before next turn
      } else {
        console.log(
          `[BotController] Bot ${botPlayer.name} turn complete, advancing to next player`
        );
        // Advance turn to next player
        const currentPlayerIndex = currentRoom.players.findIndex(
          (p) => p.id === botId
        );
        const nextIndex = (currentPlayerIndex + 1) % currentRoom.players.length;
        const oldTurn = currentRoom.currentTurn;
        currentRoom.currentTurn = currentRoom.players[nextIndex].id;

        console.log(
          `[BotController] Turn advanced from ${oldTurn} to ${currentRoom.currentTurn}`
        );

        // Emit room update with new turn
        this.io.to(roomId).emit("room_update", {
          players: currentRoom.players,
          currentTurn: currentRoom.currentTurn,
          gameStatus: currentRoom.gameStatus,
          lastRoll: currentRoom.lastRoll,
        });

        // Notify bot controller about turn change
        this.handleTurnChange(roomId, room.currentTurn);
      }

      return {
        success: true,
        isWinZone: move.nextPosition === `${botPlayer.color}WinZone`,
        killedPiece: killedPiece,
        isHome: move.isHome,
      };
    } catch (error) {
      this.logger.error(
        `[BotController] Error executing bot move for room ${roomId}, bot ${botId}:`,
        error
      );
      return false;
    }
  }

  /**
   * Calculate reaction delay based on bot difficulty
   * @param {string} difficulty - Bot difficulty level
   * @param {number} baseDelay - Base delay in milliseconds
   * @returns {number} Calculated delay in milliseconds
   */
  calculateReactionDelay(difficulty, baseDelay) {
    const randomFactor = 0.5 + Math.random(); // 0.5 to 1.5

    switch (difficulty) {
      case "easy":
        return Math.floor(baseDelay * 1.5 * randomFactor);
      case "hard":
        return Math.floor(baseDelay * 0.7 * randomFactor);
      case "medium":
      default:
        return Math.floor(baseDelay * randomFactor);
    }
  }

  /**
   * Check if a move can kill an opponent piece
   * @param {string} roomId - Room ID
   * @param {string} position - Position to check
   * @param {string} botColor - Bot's color
   * @returns {boolean} True if can kill opponent piece
   */
  canKillOpponentPiece(roomId, position, botColor) {
    try {
      const gameState = gameManager.getGameState(roomId);
      if (!gameState || !gameState.pieces) return false;

      // Check if position is safe (can't kill on safe positions)
      if (isSafePosition(position)) return false;

      // Check if any opponent piece is at this position
      for (const [pieceColor, pieces] of Object.entries(gameState.pieces)) {
        if (pieceColor === botColor) continue; // Skip bot's own pieces

        const opponentPieceIndex = pieces.indexOf(position);
        if (opponentPieceIndex !== -1) {
          return true; // Found opponent piece that can be killed
        }
      }

      return false;
    } catch (error) {
      this.logger.error(
        `[BotController] Error checking if move can kill opponent piece:`,
        error
      );
      return false;
    }
  }

  /**
   * Get safe roll value (same logic as human players)
   * @param {Object} pieces - Game pieces state
   * @param {string} color - Player color
   * @returns {number} Safe roll value
   */
  getSafeRollValue(pieces, color) {
    try {
      const possibleValues = [1, 2, 3, 4, 5, 6];
      const safeValues = [];

      for (const value of possibleValues) {
        const tokens = pieces[color] || [];
        let isSafe = true;

        for (let i = 0; i < tokens.length; i++) {
          const piece = tokens[i];
          // Skip if already in winzone
          if (piece === `${color}WinZone`) continue;

          // Calculate next position
          const nextPosition = getNextPosition(piece, value, color);
          if (!nextPosition) continue;

          // Check if any other token would land on the same position
          for (let j = 0; j < tokens.length; j++) {
            if (i === j) continue;
            if (tokens[j] === nextPosition) {
              // Only allow if safe or winzone
              if (
                !isSafePosition(nextPosition) &&
                nextPosition !== `${color}WinZone`
              ) {
                isSafe = false;
                break;
              }
            }
          }

          if (!isSafe) break;
        }

        if (isSafe) {
          safeValues.push(value);
        }
      }

      // Return random safe value or random value if none are safe
      if (safeValues.length > 0) {
        return safeValues[Math.floor(Math.random() * safeValues.length)];
      }

      return possibleValues[Math.floor(Math.random() * possibleValues.length)];
    } catch (error) {
      this.logger.error(
        `[BotController] Error calculating safe roll value for color ${color}:`,
        error
      );
      return Math.floor(Math.random() * 6) + 1;
    }
  }

  /**
   * Calculate strategic dice roll value for bot with special rules
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   * @param {Object} pieces - Game pieces state
   * @param {string} color - Player color
   * @returns {number} Strategic roll value
   */
  getStrategicBotRollValue(roomId, botId, pieces, color) {
    try {
      // Get current roll count for this bot
      const roomRollCounts = this.botRollCounts.get(roomId);
      if (!roomRollCounts) {
        console.log(`[BotController] No roll counts found for room ${roomId}`);
        return this.getSafeRollValue(pieces, color);
      }

      const currentRollCount = roomRollCounts.get(botId) || 0;

      // Increment roll count
      roomRollCounts.set(botId, currentRollCount + 1);
      const newRollCount = currentRollCount + 1;

      console.log(`[BotController] Bot ${botId} roll count: ${newRollCount}`);

      // Get room settings to check game mode
      const room = gameManager.getRoom(roomId);
      const requiredPieces = room?.gameSettings?.requiredPieces || 2;

      // Rule 1: Force 6 every 3 rolls (but consider required pieces strategy)
      if (newRollCount % 3 === 0) {
        console.log(`[BotController] Bot ${botId} forcing 6 (every 3rd roll)`);

        // Check if we should prioritize advancing existing tokens vs bringing out new ones
        const shouldPrioritizeAdvancement = this.shouldPrioritizeAdvancement(
          pieces,
          color,
          requiredPieces
        );

        if (shouldPrioritizeAdvancement) {
          console.log(
            `[BotController] Bot ${botId} has enough active tokens, prioritizing advancement over bringing out`
          );
        }

        return 5;
      }

      // Rule 2: Check if any piece is in final 6 positions before win zone
      const tokens = pieces[color] || [];
      let bestSteps = null;

      for (let i = 0; i < tokens.length; i++) {
        const piece = tokens[i];

        // Skip if already in win zone or not on board
        if (piece === `${color}WinZone` || piece.startsWith(`${color[0]}h`)) {
          continue;
        }

        // Calculate distance to win zone
        const stepsToWin = this.calculateStepsToWinZone(piece, color);

        if (stepsToWin > 0 && stepsToWin <= 6) {
          console.log(
            `[BotController] Bot ${botId} piece at ${piece} needs exactly ${stepsToWin} to reach win zone`
          );

          // Prioritize the piece that needs fewer steps (more likely to win)
          if (bestSteps === null || stepsToWin < bestSteps) {
            bestSteps = stepsToWin;
          }
        }
      }

      if (bestSteps !== null) {
        console.log(
          `[BotController] Bot ${botId} returning dice value ${bestSteps} for optimal win`
        );
        return bestSteps;
      }

      // Rule 3: Check if bot can kill any opponent token within 6 steps
      const gameState = gameManager.getGameState(roomId);
      if (gameState) {
        const killOpportunity = this.findKillOpportunity(gameState, color);
        if (killOpportunity) {
          console.log(
            `[BotController] Bot ${botId} found kill opportunity: piece at ${killOpportunity.botPiece} can kill opponent at ${killOpportunity.opponentPiece} with roll ${killOpportunity.rollNeeded}`
          );
          return killOpportunity.rollNeeded;
        }
      }

      // Default: use safe roll value
      return this.getSafeRollValue(pieces, color);
    } catch (error) {
      console.error(
        `[BotController] Error calculating strategic roll value for bot ${botId}:`,
        error
      );
      return this.getSafeRollValue(pieces, color);
    }
  }

  /**
   * Find if bot can kill any opponent token within 6 steps
   * @param {Object} gameState - Current game state
   * @param {string} botColor - Bot's color
   * @returns {Object|null} Kill opportunity with {botPiece, opponentPiece, rollNeeded} or null
   */
  findKillOpportunity(gameState, botColor) {
    try {
      const botTokens = gameState.pieces[botColor] || [];
      const allColors = ["red", "green", "yellow", "blue"];
      const opponentColors = allColors.filter((color) => color !== botColor);

      // Check each bot token
      for (const botPiece of botTokens) {
        // Skip if bot piece is at home or in win zone
        if (
          botPiece === `${botColor}WinZone` ||
          botPiece.startsWith(`${botColor[0]}h`)
        ) {
          continue;
        }

        // Try dice rolls 3-5 only (to make it less suspicious and more realistic)
        for (let rollValue = 3; rollValue <= 5; rollValue++) {
          const nextPosition = getNextPosition(botPiece, rollValue, botColor);

          if (!nextPosition || nextPosition === `${botColor}WinZone`) {
            continue;
          }

          // Check if any opponent token is at that position
          for (const opponentColor of opponentColors) {
            const opponentTokens = gameState.pieces[opponentColor] || [];

            for (const opponentPiece of opponentTokens) {
              if (opponentPiece === nextPosition) {
                // Found a kill opportunity!
                console.log(
                  `[BotController] Found kill opportunity: Bot ${botColor} piece at ${botPiece} can kill ${opponentColor} piece at ${opponentPiece} with roll ${rollValue}`
                );
                return {
                  botPiece,
                  opponentPiece,
                  rollNeeded: rollValue,
                  opponentColor,
                };
              }
            }
          }
        }
      }

      return null; // No kill opportunities found
    } catch (error) {
      console.error(
        `[BotController] Error finding kill opportunity for ${botColor}:`,
        error
      );
      return null;
    }
  }

  /**
   * Calculate steps needed to reach win zone from current position
   * @param {string} currentPosition - Current piece position
   * @param {string} color - Player color
   * @returns {number} Steps to win zone (0 if already there, -1 if can't calculate)
   */
  calculateStepsToWinZone(currentPosition, color) {
    try {
      // Try different dice values to see which one gets to win zone
      for (let steps = 1; steps <= 6; steps++) {
        const nextPosition = getNextPosition(currentPosition, steps, color);
        if (nextPosition === `${color}WinZone`) {
          return steps;
        }
      }
      return -1; // Can't reach win zone in 1-6 steps
    } catch (error) {
      console.error(
        `[BotController] Error calculating steps to win zone:`,
        error
      );
      return -1;
    }
  }

  /**
   * Determine if bot should prioritize advancing existing tokens over bringing out new ones
   * @param {Object} pieces - Game pieces state
   * @param {string} color - Player color
   * @param {number} requiredPieces - Number of pieces required to win
   * @returns {boolean} True if should prioritize advancement
   */
  shouldPrioritizeAdvancement(pieces, color, requiredPieces) {
    try {
      const tokens = pieces[color] || [];

      // Count active tokens (on board, not in home, not in win zone)
      const activeTokens = tokens.filter(
        (token) =>
          token !== `${color}WinZone` && !token.startsWith(`${color[0]}h`)
      );

      // Count tokens already in win zone
      const tokensInWinZone = tokens.filter(
        (token) => token === `${color}WinZone`
      ).length;

      // Total contributing tokens = active tokens + tokens in win zone
      const totalContributingTokens = activeTokens.length + tokensInWinZone;

      console.log(
        `[BotController] Bot has ${activeTokens.length} active tokens, ${tokensInWinZone} in win zone, ${totalContributingTokens} total contributing, requires ${requiredPieces} to win`
      );

      // If we already have enough contributing tokens (active + in win zone) to potentially win, prioritize advancement
      if (totalContributingTokens >= requiredPieces) {
        // Check if any active token can benefit significantly from advancement
        for (const token of activeTokens) {
          // Check if token can reach win zone with 6
          const nextPosition = getNextPosition(token, 6, color);
          if (nextPosition === `${color}WinZone`) {
            console.log(
              `[BotController] Token at ${token} can reach win zone with 6!`
            );
            return true;
          }

          // Check if token would get very close to win zone
          const stepsToWin = this.calculateStepsToWinZone(nextPosition, color);
          if (stepsToWin > 0 && stepsToWin <= 3) {
            console.log(
              `[BotController] Token at ${token} would be only ${stepsToWin} steps from win after moving 6`
            );
            return true;
          }
        }

        // Even if no immediate win, prioritize advancement if we have enough pieces
        console.log(
          `[BotController] Bot has enough contributing tokens (${totalContributingTokens} >= ${requiredPieces}), prioritizing advancement`
        );
        return true;
      }

      console.log(
        `[BotController] Bot should bring out new tokens (${totalContributingTokens} < ${requiredPieces} required)`
      );
      return false;
    } catch (error) {
      console.error(
        `[BotController] Error determining advancement priority:`,
        error
      );
      return false;
    }
  }

  /**
   * Clear bot timer for a specific room and bot
   * @param {string} roomId - Room ID
   * @param {string} botId - Bot player ID
   */
  clearBotTimer(roomId, botId) {
    try {
      const roomTimers = this.botTimers.get(roomId);
      if (roomTimers && roomTimers.has(botId)) {
        const timer = roomTimers.get(botId);
        clearTimeout(timer);
        roomTimers.delete(botId);
      }
    } catch (error) {
      this.logger.error(
        `[BotController] Error clearing bot timer for room ${roomId}, bot ${botId}:`,
        error
      );
    }
  }

  /**
   * Cleanup all bot timers for a room
   * @param {string} roomId - Room ID
   */
  cleanupBotTimers(roomId) {
    try {
      const roomTimers = this.botTimers.get(roomId);
      if (roomTimers) {
        roomTimers.forEach((timer, botId) => {
          clearTimeout(timer);
        });
        roomTimers.clear();
      }
      this.botTimers.delete(roomId);
    } catch (error) {
      this.logger.error(
        `[BotController] Error cleaning up bot timers for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Emit bot action log for monitoring
   * @param {string} roomId - Room ID
   * @param {string} action - Action type
   * @param {Object} data - Action data
   */
  emitBotActionLog(roomId, action, data) {
    try {
      if (this.io) {
        this.io.to(roomId).emit("botAction", {
          action,
          timestamp: new Date().toISOString(),
          ...data,
        });
      }

      this.logger.info(
        `[BotController] Bot action in room ${roomId}: ${action}`,
        data
      );
    } catch (error) {
      this.logger.error(
        `[BotController] Error emitting bot action log for room ${roomId}:`,
        error
      );
    }
  }

  /**
   * Get current status of the bot controller
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      activeRooms: this.activeBots.size,
      totalActiveBots: Array.from(this.activeBots.values()).reduce(
        (sum, bots) => sum + bots.size,
        0
      ),
      activeTimers: Array.from(this.botTimers.values()).reduce(
        (sum, timers) => sum + timers.size,
        0
      ),
      config: {
        moveDelay: BOT_CONFIG.MOVE_DELAY_MS,
        diceRollDelay: BOT_CONFIG.DICE_ROLL_DELAY_MS,
      },
    };
  }
}

// Create singleton instance
const botController = new BotController();

module.exports = {
  BotController,
  botController,
};
