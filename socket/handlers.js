const { gameManager } = require("./gameManager");
const {
  getMovableTokens,
  getNextPosition,
  isSafePosition,
  hasPlayerWon,
} = require("./utils");
const { paths } = require("../constants");
const GameRoom = require("../model/GameRoom");
const GameHistory = require("../model/GameHistory");
const GameState = require("../model/GameState");
const { botController } = require("./bots/controller");
const { BotJoiner } = require("./bots/joinBot");
const { BOT_CONFIG, initializeCache } = require("./bots/config");

// Debug bot controller import
console.log(`[Handlers] Bot controller imported:`, botController);
console.log(`[Handlers] Bot controller type:`, typeof botController);
console.log(
  `[Handlers] Bot controller handleTurnChange:`,
  typeof botController?.handleTurnChange
);

//last
// socket
// Helper to get available games
const getAvailableGames = async (userId) => {
  try {
    const allWaitingGames = await GameRoom.find({
      gameStatus: gameManager.GAME_STATUS.WAITING,
    })
      .select("roomId players gameSettings createdAt hostId")
      .lean();
    const availableGames = allWaitingGames.filter((game) => {
      try {
        const players = Array.isArray(game.players)
          ? game.players
          : JSON.parse(JSON.stringify(game.players));
        return (
          Array.isArray(players) &&
          gameManager.getRoom(game.roomId) !== undefined &&
          game.hostId !== userId
        );
      } catch (error) {
        console.error(
          `Error processing game ${game.roomId} in getAvailableGames:`,
          error
        );
        return false;
      }
    });
    return availableGames
      .map((game) => {
        try {
          const players = Array.isArray(game.players)
            ? game.players
            : JSON.parse(JSON.stringify(game.players));
          return {
            roomId: game.roomId,
            hostName: players[0]?.name,
            playerCount: players.length,
            stake: game.gameSettings.stake,
            requiredPieces: game.gameSettings.requiredPieces,
          };
        } catch (error) {
          console.error(
            `Error mapping game ${game.roomId} in getAvailableGames:`,
            error
          );
          return null;
        }
      })
      .filter(Boolean); // Remove any null entries
  } catch (error) {
    console.error("Error fetching available games:", error);
    return [];
  }
};

function maybeTriggerAutoMove(io, roomId) {
  try {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    const currentPlayerId = room.currentTurn;
    const disconnectedPlayer = gameManager.getDisconnectedPlayer(
      roomId,
      currentPlayerId
    );
    if (disconnectedPlayer) {
      const playerColor = disconnectedPlayer.color;
      performSingleAutoMove({
        io,
        roomId,
        playerId: currentPlayerId,
        playerColor,
      });
    }
  } catch (error) {
    console.error(`Error in maybeTriggerAutoMove for room ${roomId}:`, error);
    if (roomId) {
      io.to(roomId).emit(
        "error_message",
        "An error occurred during auto-move check"
      );
    }
  }
}

// Start turn timeout for current player
function startTurnTimeout(io, roomId) {
  const room = gameManager.getRoom(roomId);
  if (!room || room.gameStatus !== gameManager.GAME_STATUS.PLAYING) return;

  // Clear any existing timeout
  gameManager.clearTurnTimeout(roomId);

  // Start new timeout
  gameManager.setTurnTimeout(
    roomId,
    () => {
      handleTurnTimeout(io, roomId);
    },
    35000
  ); // 32 seconds (2 seconds buffer for frontend sync)

  console.log(
    `[TURN_TIMEOUT] Started 32s timeout for player ${room.currentTurn} in room ${roomId}`
  );
}

// Handle turn timeout - make inactive player lose
async function handleTurnTimeout(io, roomId) {
  try {
    const room = gameManager.getRoom(roomId);
    if (!room || room.gameStatus !== gameManager.GAME_STATUS.PLAYING) return;

    const currentPlayerId = room.currentTurn;
    const currentPlayer = room.players.find((p) => p.id === currentPlayerId);

    if (!currentPlayer) return;

    console.log(
      `[TURN_TIMEOUT] Player ${currentPlayer.name} (${currentPlayerId}) timed out in room ${roomId}`
    );

    // Find the other player (winner)
    const otherPlayer = room.players.find((p) => p.id !== currentPlayerId);
    if (!otherPlayer) return;

    // End the game with timeout as reason
    room.gameStatus = gameManager.GAME_STATUS.FINISHED;

    const matchResults = {
      winner: {
        id: otherPlayer.id,
        name: otherPlayer.name,
        userId: otherPlayer.userId,
        color: otherPlayer.color,
      },
      loser: {
        id: currentPlayer.id,
        name: currentPlayer.name,
        userId: currentPlayer.userId,
        color: currentPlayer.color,
      },
      reason: "turn_timeout",
      gameDuration: Date.now() - room.createdAt,
      requiredPieces: room.gameSettings.requiredPieces || 2,
      stake: room.gameSettings.stake || 50,
    };

    // Save game history to database for both players
    try {
      const GameHistory = require("../model/GameHistory");
      const GameRoom = require("../model/GameRoom");

      console.log(
        `[TURN_TIMEOUT] Creating GameHistory records for room ${roomId}`
      );

      // Create GameHistory record for the winner
      if (otherPlayer?.userId) {
        const winnerHistoryRecord = await GameHistory.create({
          user: otherPlayer.userId,
          roomId,
          status: gameManager.GAME_STATUS.FINISHED,
          players: room.players,
          winnerId: otherPlayer.userId,
          stake: room.gameSettings.stake,
          requiredPieces: room.gameSettings.requiredPieces,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `[TURN_TIMEOUT] Winner game history saved:`,
          winnerHistoryRecord._id
        );
      }

      // Create GameHistory record for the loser (the one who timed out)
      if (currentPlayer?.userId) {
        const loserHistoryRecord = await GameHistory.create({
          user: currentPlayer.userId,
          roomId,
          status: gameManager.GAME_STATUS.FINISHED,
          players: room.players,
          winnerId: otherPlayer?.userId,
          stake: room.gameSettings.stake,
          requiredPieces: room.gameSettings.requiredPieces,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `[TURN_TIMEOUT] Loser game history saved:`,
          loserHistoryRecord._id
        );
      }

      // Update GameRoom status in database
      await GameRoom.updateOne(
        { roomId },
        {
          $set: {
            gameStatus: gameManager.GAME_STATUS.FINISHED,
            players: room.players,
            updatedAt: new Date(),
          },
        }
      );

      console.log(
        `[TURN_TIMEOUT] GameRoom status updated to finished for room ${roomId}`
      );
    } catch (error) {
      console.error(
        `[TURN_TIMEOUT] Error saving game history for timeout win in room ${roomId}:`,
        error
      );
    }

    // Emit game over event
    io.to(roomId).emit("game_over", matchResults);

    // Update winner's wallet with game winnings (only if winner is not a bot)
    if (!otherPlayer.isBot && otherPlayer.userId) {
      try {
        const { addGameWinnings } = require("../controllers/wallet.controller");
        const isBotGame = room.players.some((p) => p.isBot);

        await addGameWinnings(
          otherPlayer.userId,
          room.gameSettings.stake,
          roomId,
          isBotGame
        );
        console.log(
          `[TURN_TIMEOUT] Added winnings to winner ${otherPlayer.name} in room ${roomId}`
        );
      } catch (error) {
        console.error(
          `[TURN_TIMEOUT] Error updating winner's wallet in room ${roomId}:`,
          error
        );
      }
    } else {
      console.log(
        `[TURN_TIMEOUT] Skipping wallet update - winner is a bot or has no userId: ${otherPlayer.name}`
      );
    }

    // Notify bot controller about game end
    botController.handleGameEnd(roomId);

    // Schedule room cleanup after 30 seconds (give players time to see results)
    setTimeout(() => {
      try {
        gameManager.deleteRoom(roomId);
        console.log(`[TURN_TIMEOUT] Room ${roomId} cleaned up after timeout`);
      } catch (error) {
        console.error(
          `[TURN_TIMEOUT] Error cleaning up room ${roomId}:`,
          error
        );
      }
    }, 30000); // 30 seconds delay

    console.log(
      `[TURN_TIMEOUT] Game ended due to timeout in room ${roomId}. Winner: ${otherPlayer.name}`
    );
  } catch (error) {
    console.error(`Error in handleTurnTimeout for room ${roomId}:`, error);
  }
}

// Helper: animate token movement step-by-step (reuse from move_piece)
async function emitPathStepByStep(
  roomId,
  color,
  pieceIndex,
  path,
  io,
  nextPosition,
  killedPieceInfo,
  gameState
) {
  try {
    for (let i = 0; i < path?.length; i++) {
      io.to(roomId).emit("piece_move_step", {
        color,
        index: pieceIndex,
        position: path[i],
        stepIndex: i,
        totalSteps: path?.length,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    io.to(roomId).emit("piece_move_step", {
      color,
      index: pieceIndex,
      position: nextPosition,
      stepIndex: path?.length,
      totalSteps: path?.length,
    });
    if (killedPieceInfo) {
      const {
        color: killedColor,
        index: killedIndex,
        position: currentPosition,
      } = killedPieceInfo;
      gameState.pieces[killedColor][killedIndex] = `${killedColor[0]}h${
        killedIndex + 1
      }`;
      io.to(roomId).emit("piece_killed", {
        color: killedColor,
        pieceIndex: killedIndex,
        currentPosition: currentPosition,
      });
    }
  } catch (error) {
    console.error(`Error in emitPathStepByStep for room ${roomId}:`, error);
    io.to(roomId).emit(
      "error_message",
      "An error occurred during piece animation"
    );
  }
}
//prisma
// Helper: get a dice roll value that avoids stacking tokens on the same position (unless safe or winzone)
function getSafeRollValue(pieces, color) {
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
      if (isSafe) safeValues.push(value);
    }
    // If there are safe values, pick one randomly; otherwise, pick any value
    if (safeValues.length > 0) {
      return safeValues[Math.floor(Math.random() * safeValues.length)];
    } else {
      return possibleValues[Math.floor(Math.random() * possibleValues.length)];
    }
  } catch (error) {
    console.error(`Error in getSafeRollValue for color ${color}:`, error);
    // Fallback to random roll if error occurs
    return Math.floor(Math.random() * 6) + 1;
  }
}

// Helper: perform a single auto-move for a disconnected player (when it's their turn)
async function performSingleAutoMove({ io, roomId, playerId, playerColor }) {
  const room = gameManager.getRoom(roomId);
  const gameState = gameManager.getGameState(roomId);

  // Check if this is the first auto-move to emit start event
  const currentMoveCount = gameManager.getAutoMoveCount(roomId, playerId) || 0;
  if (currentMoveCount === 0) {
    const disconnectedPlayer = gameManager.getDisconnectedPlayer(
      roomId,
      playerId
    );
    const playerName =
      disconnectedPlayer?.playerName ||
      room.players.find((p) => p.id === playerId)?.name ||
      "Unknown";

    io.to(roomId).emit("auto_move_started", {
      playerId,
      playerName,
      playerColor,
    });
  }

  // Increment auto-move count at dice rolling phase (as requested)
  const moveNumber = gameManager.incrementAutoMoveCount(roomId, playerId);
  console.log(moveNumber, "[AUTO-MOVE COUNT]");

  console.log(
    `[AUTO-MOVE] Performing auto-move #${moveNumber} for player ${playerId} (${playerColor}) in room ${roomId}`
  );

  // Emit auto-move progress
  io.to(roomId).emit("auto_move_progress", {
    playerId,
    currentMove: moveNumber,
    totalMoves: 5,
  });

  // Emit rolling status and wait 3 seconds
  io.to(roomId).emit("rolling_dice", { playerId });
  await new Promise((res) => setTimeout(res, 3000));
  // Check if this is the player's first roll (all pieces are in home)
  const isFirstRoll = !gameState.pieces[playerColor]?.some(
    (piece) => piece && !piece.startsWith(`${playerColor[0]}h`)
  );

  let value;
  if (isFirstRoll) {
    // First roll: always roll 6 to ensure player can move
    value = 6;
    console.log(
      `[AUTO-MOVE] First roll for player ${playerId}, forcing value 6`
    );
  } else {
    // Subsequent rolls: use safe roll logic
    value = getSafeRollValue(gameState.pieces, playerColor);
  }
  let gotExtraTurn = false;
  let killedPieceInfo = null;
  // Update lastRoll for auto-move
  room.lastRoll = { value, roller: playerId, moved: false };
  const movableTokens = getMovableTokens(gameState.pieces, playerColor, value);
  if (movableTokens.length === 0) {
    console.log(
      `[AUTO-MOVE] No move possible for player ${playerId} (roll: ${value})`
    );
    io.to(roomId).emit("auto_play", {
      playerId,
      playerColor,
      value,
      moved: false,
    });
    // Always advance the turn if no move is possible
    if (room.gameStatus !== gameManager.GAME_STATUS.FINISHED) {
      const nextIndex =
        (room.players.findIndex((p) => p.id === playerId) + 1) %
        room.players.length;
      room.currentTurn = room.players[nextIndex].id;
      io.to(roomId).emit("room_update", {
        players: room.players,
        currentTurn: room.currentTurn,
        gameStatus: room.gameStatus,
      });
      setTimeout(() => maybeTriggerAutoMove(io, roomId), 500);
    }
    return;
  }
  const pieceIndex =
    movableTokens[Math.floor(Math.random() * movableTokens.length)];
  const piece = gameState.pieces[playerColor][pieceIndex];
  const rollValue = value;
  const nextPosition = getNextPosition(piece, rollValue, playerColor);
  if (!nextPosition) {
    console.log(
      `[AUTO-MOVE] Invalid move for player ${playerId} (roll: ${value})`
    );
    io.to(roomId).emit("auto_play", {
      playerId,
      playerColor,
      value,
      moved: false,
    });
  } else {
    function generateNewPath(currentPosition, rollValue, color) {
      const path = paths[color];
      if (!path) return null;
      const currentIndex = path.indexOf(currentPosition);
      if (currentIndex === -1) return null;
      let newIndex = currentIndex + rollValue;
      if (newIndex >= path.length) newIndex = path.length - 1;
      const newPath = path.slice(currentIndex, newIndex + 1);
      return newPath;
    }
    const path = generateNewPath(piece, rollValue, playerColor);
    const killedPiece = Object.entries(gameState.pieces).find(
      ([pieceColor, pieces]) => {
        if (pieceColor === playerColor) return false;
        return pieces.some(
          (p) => p === nextPosition && !isSafePosition(nextPosition)
        );
      }
    );
    if (killedPiece) {
      const [killedColor, killedPieces] = killedPiece;
      const killedIndex = killedPieces.indexOf(nextPosition);
      killedPieceInfo = {
        color: killedColor,
        index: killedIndex,
        position: nextPosition,
      };
      gotExtraTurn = true;
    }
    gameState.pieces[playerColor][pieceIndex] = nextPosition;
    if (nextPosition === `${playerColor}WinZone`) {
      io.to(roomId).emit("piece_finished", {
        color: playerColor,
        pieceIndex,
      });
    }
    await emitPathStepByStep(
      roomId,
      playerColor,
      pieceIndex,
      path,
      io,
      nextPosition,
      killedPieceInfo,
      gameState
    );
    io.to(roomId).emit("auto_play", {
      playerId,
      playerColor,
      value,
      moved: true,
      pieceIndex,
      nextPosition,
    });
    io.to(roomId).emit("piece_moved", {
      pieces: gameState.pieces,
      color: playerColor,
      index: pieceIndex,
    });
    console.log(
      `[AUTO-MOVE] Player ${playerId} auto-moved piece ${pieceIndex} to ${nextPosition} (roll: ${value})`
    );
    if (
      hasPlayerWon(
        gameState.pieces,
        playerColor,
        room.gameSettings.requiredPieces
      )
    ) {
      room.gameStatus = gameManager.GAME_STATUS.FINISHED;

      // Find the human player (winner) and bot player (loser)
      const winner = room.players.find((p) => p.id === playerId);
      const loser = room.players.find((p) => p.id !== playerId);

      // Save game history to database
      try {
        console.log(
          `[AUTO-MOVE] Creating GameHistory record for room ${roomId}`
        );
        console.log(`[AUTO-MOVE] Winner:`, winner);
        console.log(`[AUTO-MOVE] Room players:`, room.players);

        const gameHistoryRecord = await GameHistory.create({
          user: winner?.userId,
          roomId,
          status: gameManager.GAME_STATUS.FINISHED,
          players: room.players,
          winnerId: winner?.userId,
          stake: room.gameSettings.stake,
          requiredPieces: room.gameSettings.requiredPieces,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(
          `[AUTO-MOVE] Game history saved successfully:`,
          gameHistoryRecord._id
        );
      } catch (error) {
        console.error(
          `[AUTO-MOVE] Error saving game history for auto-move win in room ${roomId}:`,
          error
        );
      }

      // Update winner's wallet with game winnings
      try {
        const { addGameWinnings } = require("../controllers/wallet.controller");
        const isBotGame = room.players.some((p) => p.isBot);

        await addGameWinnings(
          winner.userId,
          room.gameSettings.stake,
          roomId,
          isBotGame
        );
        console.log(
          `[AUTO-MOVE] Added winnings to winner ${winner.name} in room ${roomId}`
        );
      } catch (error) {
        console.error(
          `[AUTO-MOVE] Error updating winner's wallet in room ${roomId}:`,
          error
        );
      }

      // Emit auto-move completion event for win
      io.to(roomId).emit("auto_move_complete", {
        playerId,
        reason: "game_won",
        winner: {
          id: winner.id,
          name: winner.name,
          color: winner.color,
        },
      });

      // Create detailed match results
      const matchResults = {
        winner: {
          id: winner.id,
          name: winner.name,
          color: winner.color,
          pieces: gameState.pieces[winner.color],
          isBot: winner.isBot || false,
        },
        loser: {
          id: loser.id,
          name: loser.name,
          color: loser.color,
          pieces: gameState.pieces[loser.color],
          isBot: loser.isBot || false,
        },
        gameDuration: Date.now() - room.createdAt,
        requiredPieces: room.gameSettings.requiredPieces,
        stake: room.gameSettings.stake,
        reason: "auto_move_win", // Add reason for frontend handling
      };

      io.to(roomId).emit("game_over", matchResults);

      // Notify bot controller about game end
      botController.handleGameEnd(roomId);
      console.log(
        `[AUTO-MOVE] Player ${playerId} won by auto-move in room ${roomId}`
      );
      return;
    }
    if (value === 6) {
      gotExtraTurn = true;
    }
  }
  // If reached 5 auto-moves, mark as loser
  const loser = room.players.find((p) => p.id === playerId);
  const winner = room.players.find((p) => p.id !== playerId);
  console.log("[winner] :", winner, "[loser] :", loser);

  if (gameManager.getAutoMoveCount(roomId, playerId) >= 5) {
    room.gameStatus = gameManager.GAME_STATUS.FINISHED;
    const player = room.players.find((p) => p.id === playerId);
    console.log(
      `[5-AUTO-MOVES] Creating GameHistory record for room ${roomId}`
    );
    console.log(`[5-AUTO-MOVES] Loser:`, player);
    console.log(`[5-AUTO-MOVES] Winner:`, winner);

    // Emit auto-move completion event
    io.to(roomId).emit("auto_move_complete", {
      playerId,
      reason: "limit_reached",
      winner: {
        id: winner.id,
        name: winner.name,
        color: winner.color,
      },
    });

    const gameHistoryRecord = await GameHistory.create({
      user: player?.userId,
      roomId,
      status: gameManager.GAME_STATUS.FINISHED,
      players: room.players,
      winnerId: winner?.userId,
      stake: room.gameSettings.stake,
      requiredPieces: room.gameSettings.requiredPieces,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log(
      `[5-AUTO-MOVES] Game history saved successfully:`,
      gameHistoryRecord._id
    );
    const matchResults = {
      winner: {
        id: winner.id,
        name: winner.name,
        color: winner.color,
        pieces: gameState.pieces[winner.color],
        isBot: winner.isBot || false,
      },
      loser: {
        id: loser.id,
        name: loser.name,
        color: loser.color,
        pieces: gameState.pieces[loser.color],
        isBot: loser.isBot || false,
      },
      gameDuration: Date.now() - room.createdAt,
      requiredPieces: room.gameSettings.requiredPieces,
      stake: room.gameSettings.stake,
      reason: "auto_move_limit_reached", // Add reason for frontend handling
    };
    console.log(matchResults);

    io.to(roomId).emit("game_over", matchResults);

    // Update winner's wallet with game winnings
    try {
      const { addGameWinnings } = require("../controllers/wallet.controller");
      const isBotGame = room.players.some((p) => p.isBot);

      await addGameWinnings(
        winner.userId,
        room.gameSettings.stake,
        roomId,
        isBotGame
      );
      console.log(
        `[AUTO-MOVE] Added winnings to winner ${winner.name} in room ${roomId}`
      );
    } catch (error) {
      console.error(
        `[AUTO-MOVE] Error updating winner's wallet in room ${roomId}:`,
        error
      );
    }

    // Notify bot controller about game end
    botController.handleGameEnd(roomId);

    gameManager.removeDisconnectedPlayer(roomId, playerId);
    console.log(
      `[AUTO-MOVE] Player ${playerId} marked as loser after 5 auto-moves in room ${roomId}`
    );
    // Advance turn to next player and check if they are disconnected
    const nextIndex =
      (room.players.findIndex((p) => p.id === playerId) + 1) %
      room.players.length;
    room.currentTurn = room.players[nextIndex].id;
    io.to(roomId).emit("room_update", {
      players: room.players,
      currentTurn: room.currentTurn,
      gameStatus: room.gameStatus,
    });
    setTimeout(() => maybeTriggerAutoMove(io, roomId), 500);
    return;
  }
  // If got extra turn (6 or kill), trigger auto-move again for same player
  if (gotExtraTurn && room.gameStatus !== gameManager.GAME_STATUS.FINISHED) {
    setTimeout(() => maybeTriggerAutoMove(io, roomId), 500);
  } else if (room.gameStatus !== gameManager.GAME_STATUS.FINISHED) {
    // Advance turn to next player and check if they are disconnected
    const nextIndex =
      (room.players.findIndex((p) => p.id === playerId) + 1) %
      room.players.length;
    room.currentTurn = room.players[nextIndex].id;
    io.to(roomId).emit("room_update", {
      players: room.players,
      currentTurn: room.currentTurn,
      gameStatus: room.gameStatus,
    });
    setTimeout(() => maybeTriggerAutoMove(io, roomId), 500);
  }
}

/**
 * Handle bot replacement when a human player joins a room with bots
 * @param {string} roomId - Room ID
 * @param {Object} humanPlayer - Human player object
 * @param {Object} io - Socket.io instance
 * @param {Object} options - Options for replacement
 * @returns {Promise<Object|null>} Removed bot player or null if no replacement needed
 */
async function handleBotReplacement(roomId, humanPlayer, io, options = {}) {
  const { useRedisLock = false, redisClient = null } = options;

  try {
    const room = gameManager.getRoom(roomId);
    if (!room || !gameManager.hasBotPlayers(roomId)) {
      return null;
    }

    // Use Redis lock if configured, otherwise use atomic DB update
    if (useRedisLock && redisClient) {
      return await handleBotReplacementWithRedisLock(
        roomId,
        humanPlayer,
        io,
        redisClient
      );
    } else {
      return await handleBotReplacementWithAtomicUpdate(
        roomId,
        humanPlayer,
        io
      );
    }
  } catch (error) {
    console.error(
      `[BotReplacement] Error replacing bot in room ${roomId}:`,
      error
    );
    return null;
  }
}

/**
 * Handle bot replacement using Redis lock for atomicity
 * @param {string} roomId - Room ID
 * @param {Object} humanPlayer - Human player object
 * @param {Object} io - Socket.io instance
 * @param {Object} redisClient - Redis client instance
 * @returns {Promise<Object|null>} Removed bot player or null if failed
 */
async function handleBotReplacementWithRedisLock(
  roomId,
  humanPlayer,
  io,
  redisClient
) {
  const lockKey = `bot_replacement_lock:${roomId}`;
  const lockValue = `bot_replacement_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 15)}`;
  const lockTimeout = 10000; // 10 seconds lock timeout

  try {
    // Acquire Redis lock
    const lockAcquired = await redisClient.set(
      lockKey,
      lockValue,
      "PX",
      lockTimeout,
      "NX"
    );

    if (!lockAcquired) {
      console.warn(
        `[BotReplacement] Could not acquire lock for room ${roomId}`
      );
      return null;
    }

    try {
      // Verify room still has bots under lock
      const room = gameManager.getRoom(roomId);
      if (!room || !gameManager.hasBotPlayers(roomId)) {
        await releaseRedisLock(redisClient, lockKey, lockValue);
        return null;
      }

      // Remove bot from database
      const updateResult = await GameRoom.updateOne(
        { roomId, gameStatus: gameManager.GAME_STATUS.WAITING },
        {
          $pull: { players: { isBot: true } },
        }
      );

      if (!updateResult.modifiedCount) {
        await releaseRedisLock(redisClient, lockKey, lockValue);
        return null;
      }

      // Remove the last-joined bot from in-memory state
      const removedBot = gameManager.removeLastJoinedBot(roomId);
      if (!removedBot) {
        await releaseRedisLock(redisClient, lockKey, lockValue);
        return null;
      }

      // Emit playerLeft event for the removed bot
      io.to(roomId).emit("playerLeft", {
        id: removedBot.id,
        name: removedBot.name,
        reason: "replaced_by_human",
      });

      // Release lock
      await releaseRedisLock(redisClient, lockKey, lockValue);

      console.log(
        `[BotReplacement] Bot ${removedBot.name} replaced by human ${humanPlayer.name} in room ${roomId}`
      );
      return removedBot;
    } catch (error) {
      // Release lock on error
      await releaseRedisLock(redisClient, lockKey, lockValue);
      throw error;
    }
  } catch (error) {
    console.error(
      `[BotReplacement] Redis lock error for room ${roomId}:`,
      error
    );
    return null;
  }
}

/**
 * Handle bot replacement using atomic database update
 * @param {string} roomId - Room ID
 * @param {Object} humanPlayer - Human player object
 * @param {Object} io - Socket.io instance
 * @returns {Promise<Object|null>} Removed bot player or null if failed
 */
async function handleBotReplacementWithAtomicUpdate(roomId, humanPlayer, io) {
  try {
    // Use atomic database update to prevent race conditions
    const updateResult = await GameRoom.findOneAndUpdate(
      {
        roomId,
        gameStatus: gameManager.GAME_STATUS.WAITING,
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$players",
                  cond: { $eq: ["$$this.isBot", true] },
                },
              },
            },
            0,
          ],
        },
      },
      {
        $pull: {
          players: { isBot: true },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updateResult) {
      console.log(
        `[BotReplacement] Room ${roomId} not eligible for bot replacement`
      );
      return null;
    }

    // Get the updated room to verify current state
    const updatedRoom = await GameRoom.findOne({ roomId }).lean();
    if (
      !updatedRoom ||
      updatedRoom.gameStatus !== gameManager.GAME_STATUS.WAITING
    ) {
      console.log(
        `[BotReplacement] Room ${roomId} state changed after bot removal`
      );
      return null;
    }

    // Remove the last-joined bot from in-memory state
    const removedBot = gameManager.removeLastJoinedBot(roomId);
    if (!removedBot) {
      console.log(`[BotReplacement] No bot found to remove in room ${roomId}`);
      return null;
    }

    // Emit playerLeft event for the removed bot
    io.to(roomId).emit("playerLeft", {
      id: removedBot.id,
      name: removedBot.name,
      reason: "replaced_by_human",
    });

    console.log(
      `[BotReplacement] Bot ${removedBot.name} replaced by human ${humanPlayer.name} in room ${roomId}`
    );
    return removedBot;
  } catch (error) {
    console.error(
      `[BotReplacement] Atomic update error for room ${roomId}:`,
      error
    );
    return null;
  }
}

/**
 * Release Redis lock
 * @param {Object} redisClient - Redis client instance
 * @param {string} lockKey - Lock key
 * @param {string} lockValue - Lock value for verification
 * @returns {Promise<void>}
 */
async function releaseRedisLock(redisClient, lockKey, lockValue) {
  try {
    // Use Lua script for atomic lock release
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    await redisClient.eval(luaScript, 1, lockKey, lockValue);
  } catch (error) {
    console.error(
      `[BotReplacement] Error releasing Redis lock ${lockKey}:`,
      error
    );
  }
}

function registerSocketHandlers(io) {
  // Initialize bot config cache
  initializeCache().catch((error) => {
    console.error("[Handlers] Error initializing bot config cache:", error);
  });

  // Initialize bot controller with Socket.io instance
  console.log(`[Handlers] About to initialize bot controller with io:`, io);
  console.log(`[Handlers] Bot controller before init:`, botController);
  console.log(`[Handlers] Bot controller methods:`, {
    handleTurnChange: typeof botController.handleTurnChange,
    scheduleBotTurn: typeof botController.scheduleBotTurn,
    executeBotTurn: typeof botController.executeBotTurn,
  });
  botController.initialize(io);
  console.log(`[Handlers] Bot controller after init:`, botController);
  console.log(`[Handlers] Bot controller io after init:`, botController.io);
  console.log(`[Handlers] Bot controller methods after init:`, {
    handleTurnChange: typeof botController.handleTurnChange,
    scheduleBotTurn: typeof botController.scheduleBotTurn,
    executeBotTurn: typeof botController.executeBotTurn,
  });

  io.on("connection", async (socket) => {
    // Send available games to newly connected client
    try {
      const availableGames = await getAvailableGames(socket.user.id);
      socket.emit("available_games", availableGames);
    } catch (error) {
      console.error("Error sending available games to new client:", error);
      socket.emit("error_message", "Failed to load available games");
    }

    socket.on("get_available_games", async () => {
      try {
        const availableGames = await getAvailableGames(socket.user.id);
        socket.emit("available_games", availableGames);
      } catch (error) {
        console.error("Error getting available games:", error);
        socket.emit("error_message", "Failed to load available games");
      }
    });

    socket.on("create_room", async ({ playerName, requiredPieces, stake }) => {
      try {
        // Check if player has sufficient balance for the stake
        const Wallet = require("../model/Wallet");
        const wallet = await Wallet.findOne({ user: socket.user.id });
        if (!wallet || wallet.balance < stake) {
          socket.emit(
            "error_message",
            `Insufficient balance. You need ${stake} ብር to create this game. Your current balance: ${
              wallet?.balance || 0
            } ብር`
          );
          return;
        }

        const roomId = require("uuid").v4().slice(0, 6);
        const gameSettings = { stake, requiredPieces };
        const roomData = {
          players: [
            {
              id: socket.id,
              userId: socket.user.id,
              name: socket.user.username,
              color: "blue",
            },
          ],
          currentTurn: socket.id,
          gameStatus: gameManager.GAME_STATUS.WAITING,
          dieStatus: gameManager.DIE_STATUS.STOPPED,
          lastRoll: null,
          createdAt: Date.now(),
          hostId: socket.user.id,
          gameSettings,
        };
        // Check if bots are enabled in database once at game creation
        const {
          getBotsEnabled,
        } = require("../controllers/gameSetting.controller");
        let botsEnabled = false;
        try {
          botsEnabled = await getBotsEnabled();
          console.log(
            `[CreateRoom] Bots enabled setting from database: ${botsEnabled}`
          );
        } catch (error) {
          console.error(
            "[CreateRoom] Error fetching bots enabled setting:",
            error
          );
          // Use default value if database fetch fails
          botsEnabled = BOT_CONFIG.BOTS_ENABLED;
        }

        const gameRoomDoc = await GameRoom.create({
          roomId,
          players: roomData.players,
          currentTurn: roomData.currentTurn,
          gameStatus: roomData.gameStatus,
          dieStatus: roomData.dieStatus,
          lastRoll: roomData.lastRoll,
          hostId: socket.user.id,
          host: socket.user.id || undefined,
          gameSettings: roomData.gameSettings,
          botsEnabled: botsEnabled, // Store the decision at game creation time
        });
        const gameStateDoc = await GameState.create({
          roomId,
          pieces: {
            green: ["gh1", "gh2", "gh3", "gh4"],
            blue: ["bh1", "bh2", "bh3", "bh4"],
          },
          room: gameRoomDoc._id,
        });
        gameRoomDoc.gameState = gameStateDoc._id;
        await gameRoomDoc.save();
        const roomState = gameManager.createRoom(roomId, roomData);
        // Set the botsEnabled field in the room state
        roomState.botsEnabled = botsEnabled;
        gameManager.updateGameState(roomId, {
          pieces: {
            // red: ["rh1", "rh2", "rh3", "rh4"],
            green: ["gh1", "gh2", "gh3", "gh4"],
            blue: ["bh1", "bh2", "bh3", "bh4"],
            // yellow: ["yh1", "yh2", "yh3", "yh4"],
          },
        });
        const timeoutId = setTimeout(async () => {
          if (gameManager.getRoom(roomId)?.players.length === 1) {
            try {
              await GameRoom.deleteOne({ roomId });
              gameManager.deleteRoom(roomId);
              if (gameManager.getWaitingRoom() === roomId)
                gameManager.setWaitingRoom(null);
              io.to(socket.id).emit("room_deleted", {
                reason: "no_players_joined",
                message:
                  "Your game room was deleted because no one joined within 10 minutes",
              });
              const availableGames = await getAvailableGames(socket.user.id);
              io.emit("available_games", availableGames);
            } catch (error) {
              console.error(`Error deleting timed-out room ${roomId}:`, error);
            }
          }
        }, 600000); // 10 minutes

        gameManager.setRoomTimeout(roomId, timeoutId);
        gameManager.setWaitingRoom(roomId);
        socket.join(roomId);
        socket.emit("room_created", { roomId });

        // Emit fresh game data to the creator
        socket.emit("gameData", {
          players: gameManager.getRoom(roomId).players,
          currentTurn: gameManager.getRoom(roomId).currentTurn,
          gameStatus: gameManager.getRoom(roomId).gameStatus,
          gameSettings,
          lastRoll: null,
        });

        io.to(roomId).emit("room_update", {
          players: gameManager.getRoom(roomId).players,
          currentTurn: gameManager.getRoom(roomId).currentTurn,
          gameStatus: gameManager.getRoom(roomId).gameStatus,
          gameSettings,
        });
        io.emit("available_games", await getAvailableGames(socket.user.id));

        // Automatically join bots to fill the room after a configurable delay
        // Use the stored decision from game creation time
        if (botsEnabled) {
          setTimeout(async () => {
            try {
              console.log(
                `[CreateRoom] Starting bot join process for room ${roomId} (bots enabled: ${botsEnabled})`
              );
              console.log(
                `[CreateRoom] Current room state:`,
                gameManager.getRoom(roomId)
              );

              const botJoiner = new BotJoiner();
              const botCount = Math.min(2 - roomData.players.length, 1); // Max 1 bot, fill to 2 players
              console.log(
                `[CreateRoom] Planning to join ${botCount} bots to room ${roomId}`
              );

              if (botCount > 0) {
                console.log(
                  `[CreateRoom] Auto-joining ${botCount} bots to room ${roomId}`
                );
                const joinedBots = await botJoiner.joinMultipleBots(
                  roomId,
                  botCount,
                  io
                );
                console.log(
                  `[CreateRoom] Successfully joined ${joinedBots.length} bots to room ${roomId}`
                );

                // Log the final room state after bot joining
                const finalRoomState = gameManager.getRoom(roomId);
                console.log(
                  `[CreateRoom] Final room state after bot joining:`,
                  {
                    roomId,
                    playerCount: finalRoomState?.players?.length || 0,
                    gameStatus: finalRoomState?.gameStatus || "unknown",
                    currentTurn: finalRoomState?.currentTurn || "none",
                    players:
                      finalRoomState?.players?.map((p) => ({
                        id: p.id,
                        name: p.name,
                        isBot: p.isBot,
                        color: p.color,
                      })) || [],
                  }
                );
              } else {
                console.log(`[CreateRoom] No bots needed for room ${roomId}`);
              }
            } catch (botError) {
              console.error(
                `[CreateRoom] Error auto-joining bots to room ${roomId}:`,
                botError
              );
              // Don't fail room creation if bot joining fails
            }
          }, BOT_CONFIG.IMMEDIATE_JOIN_DELAY_MS); // Use configurable delay from environment
        } else {
          console.log(
            `[CreateRoom] Bots are disabled for this game, skipping bot join for room ${roomId}`
          );
        }

        // Notify bot controller about game start (only if bots are enabled for this game)
        if (botsEnabled && botController && botController.handleGameStart) {
          console.log(
            `[CreateRoom] About to notify bot controller about game start for room ${roomId}`
          );
          console.log(`[CreateRoom] Bot controller:`, botController);
          console.log(
            `[CreateRoom] Bot controller handleGameStart:`,
            typeof botController.handleGameStart
          );

          try {
            botController.handleGameStart(roomId);
            console.log(
              `[CreateRoom] Bot controller handleGameStart called successfully`
            );
          } catch (error) {
            console.error(
              `[CreateRoom] Error calling bot controller handleGameStart:`,
              error
            );
          }
        } else if (!botsEnabled) {
          console.log(
            `[CreateRoom] Bots are disabled for this game, skipping bot controller notification for room ${roomId}`
          );
        } else {
          console.log(
            `[CreateRoom] Bot controller or handleGameStart method not available`
          );
        }
      } catch (error) {
        console.error("Error creating game room:", error);
        socket.emit("error_message", "Failed to create game room");
      }
    });

    // (join_room, roll_dice, move_piece, disconnect, reconnect_to_room, cleanup, etc.)

    socket.on("join_room", async ({ roomId }) => {
      try {
        if (!roomId || !gameManager.getRoom(roomId)) {
          socket.emit("error_message", "Room not found!");
          return;
        }

        // Acquire join lock to prevent multiple simultaneous joins
        if (!gameManager.acquireJoinLock(roomId)) {
          socket.emit(
            "error_message",
            "Room is currently busy. Please try again in a moment."
          );
          return;
        }

        try {
          const room = gameManager.getRoom(roomId);
          if (room.players.length >= 2) {
            socket.emit("error_message", "Room is full!");
            return;
          }
          if (room.gameStatus !== gameManager.GAME_STATUS.WAITING) {
            socket.emit("error_message", "Game has already started!");
            return;
          }

          // Check if player has sufficient balance for the stake
          const Wallet = require("../model/Wallet");
          const wallet = await Wallet.findOne({ user: socket.user.id });
          if (!wallet || wallet.balance < room.gameSettings.stake) {
            socket.emit(
              "error_message",
              `Insufficient balance. You need ${
                room.gameSettings.stake
              } ብር to join this game. Your current balance: ${
                wallet?.balance || 0
              } ብር`
            );
            return;
          }

          // Check if room contains bot players and handle replacement
          let removedBot = null;
          let humanPlayer = null;
          if (gameManager.hasBotPlayers(roomId)) {
            console.log(
              `[JoinRoom] Room ${roomId} contains bots, attempting replacement`
            );

            humanPlayer = {
              id: socket.id,
              userId: socket.user.id,
              name: socket.user.username,
              color: null, // Will be assigned after bot replacement
              isBot: false,
              joinedAt: new Date(),
            };

            // Atomically replace a bot with the human player
            removedBot = await handleBotReplacement(roomId, humanPlayer, io);

            if (removedBot) {
              console.log(
                `[JoinRoom] Successfully replaced bot ${removedBot.name} with human ${humanPlayer.name}`
              );
            } else {
              console.log(
                `[JoinRoom] Bot replacement failed, proceeding with normal join`
              );
            }
          }

          // Clear room timeout if it exists
          const roomTimeout = gameManager.getRoom(roomId)?.roomTimeout;
          if (roomTimeout) {
            clearTimeout(roomTimeout);
            gameManager.setRoomTimeout(roomId, null);
          }

          // Create human player object if not already created
          if (!humanPlayer) {
            humanPlayer = {
              id: socket.id,
              userId: socket.user.id,
              name: socket.user.username,
              color: null, // Will be assigned below
              isBot: false,
              joinedAt: new Date(),
            };
          }

          // Add human player to room
          room.players.push(humanPlayer);
          socket.join(roomId);

          // Assign colors based on player count (2-player game)
          if (room.players.length === 1) {
            room.players[0].color = "blue";
          } else if (room.players.length === 2) {
            room.players[1].color = "green";
          }

          // Update game status if room is full
          if (room.players.length >= 2) {
            room.gameStatus = gameManager.GAME_STATUS.PLAYING;

            // Set the first player's turn when game starts
            if (room.players.length > 0) {
              room.currentTurn = room.players[0].id;
            }

            if (gameManager.getWaitingRoom() === roomId) {
              gameManager.setWaitingRoom(null);
            }

            // Check if human players still have sufficient balance before starting game
            try {
              const Wallet = require("../model/Wallet");
              for (const player of room.players) {
                if (!player.isBot && player.userId) {
                  const wallet = await Wallet.findOne({ user: player.userId });
                  if (!wallet || wallet.balance < room.gameSettings.stake) {
                    console.error(
                      `[JoinRoom] Player ${
                        player.name
                      } has insufficient balance for game start. Required: ${
                        room.gameSettings.stake
                      } ብር, Available: ${wallet?.balance || 0} ብር`
                    );
                    // Revert game status and remove the joining player
                    room.gameStatus = gameManager.GAME_STATUS.WAITING;
                    room.players = room.players.filter(
                      (p) => p.id !== socket.id
                    );
                    socket.leave(roomId);
                    socket.emit(
                      "error_message",
                      `Cannot start game: ${player.name} has insufficient balance`
                    );
                    return;
                  }
                }
              }

              // Deduct stakes from all human players when game starts
              const {
                deductGameStake,
              } = require("../controllers/wallet.controller");

              for (const player of room.players) {
                if (!player.isBot && player.userId) {
                  try {
                    await deductGameStake(
                      player.userId,
                      room.gameSettings.stake,
                      roomId
                    );
                    console.log(
                      `[JoinRoom] Deducted ${room.gameSettings.stake} ብር from player ${player.name} (${player.userId})`
                    );
                  } catch (error) {
                    console.error(
                      `[JoinRoom] Failed to deduct stake from player ${player.name}:`,
                      error
                    );
                    // If stake deduction fails, we should probably not start the game
                    // For now, just log the error
                  }
                }
              }
            } catch (error) {
              console.error(
                `[JoinRoom] Error setting up stake deduction:`,
                error
              );
              // Revert game status if there was an error
              if (room.gameStatus === gameManager.GAME_STATUS.PLAYING) {
                room.gameStatus = gameManager.GAME_STATUS.WAITING;
              }
            }

            // Notify bot controller about game start
            botController.handleGameStart(roomId);
          }

          // Update database
          await GameRoom.updateOne(
            { roomId },
            {
              $set: {
                players: room.players,
                gameStatus: room.gameStatus,
              },
            }
          );

          // Emit playerJoined event for the human player
          io.to(roomId).emit("playerJoined", humanPlayer);

          // Emit fresh game data to the joining player
          socket.emit("gameData", {
            players: room.players,
            currentTurn: room.currentTurn,
            gameStatus: room.gameStatus,
            gameSettings: room.gameSettings,
            lastRoll: room.lastRoll,
          });

          // Emit room update
          io.to(roomId).emit("room_update", {
            players: room.players,
            currentTurn: room.currentTurn,
            gameStatus: room.gameStatus,
            gameSettings: room.gameSettings,
          });

          // Start turn timeout if game is playing
          if (room.gameStatus === gameManager.GAME_STATUS.PLAYING) {
            startTurnTimeout(io, roomId);
          }

          // Notify bot controller about turn change (only if bots are enabled)
          if (room.currentTurn && BOT_CONFIG.BOTS_ENABLED) {
            botController.handleTurnChange(roomId, room.currentTurn);
          }

          // Update available games
          io.emit("available_games", await getAvailableGames(socket.user.id));

          console.log(
            `[JoinRoom] Human player ${humanPlayer.name} successfully joined room ${roomId}`
          );
        } finally {
          // Always release the join lock
          gameManager.releaseJoinLock(roomId);
        }
      } catch (error) {
        console.error(`Error joining room ${roomId}:`, error);
        socket.emit("error_message", "Failed to join room");
        // Also notify the room about the error if possible
        if (roomId) {
          io.to(roomId).emit(
            "error_message",
            "A player failed to join the room"
          );
        }
        // Ensure join lock is released on error
        gameManager.releaseJoinLock(roomId);
      }
    });

    // Get fresh game data for a specific game
    socket.on("getGameData", async ({ gameId }) => {
      try {
        if (!gameId) {
          socket.emit("error_message", "Game ID is required!");
          return;
        }

        const room = gameManager.getRoom(gameId);
        if (!room) {
          socket.emit("error_message", "Game not found!");
          return;
        }

        // Emit fresh game data
        socket.emit("gameData", {
          players: room.players,
          currentTurn: room.currentTurn,
          gameStatus: room.gameStatus,
          gameSettings: room.gameSettings,
          lastRoll: room.lastRoll,
        });

        console.log(`[GetGameData] Fresh game data sent for game ${gameId}`);
      } catch (error) {
        console.error(`Error getting game data for ${gameId}:`, error);
        socket.emit("error_message", "Failed to get game data");
      }
    });

    // Get room info including game settings
    socket.on("get_room_info", async ({ roomId }) => {
      try {
        if (!roomId) {
          socket.emit("error_message", "Room ID is required!");
          return;
        }

        const room = gameManager.getRoom(roomId);
        if (!room) {
          socket.emit("error_message", "Room not found!");
          return;
        }

        // Emit room info with current game settings
        socket.emit("room_info", {
          players: room.players,
          currentTurn: room.currentTurn,
          gameStatus: room.gameStatus,
          gameSettings: room.gameSettings,
        });

        console.log(`[GetRoomInfo] Room info sent for room ${roomId}`);
      } catch (error) {
        console.error(`Error getting room info for ${roomId}:`, error);
        socket.emit("error_message", "Failed to get room info");
      }
    });

    socket.on("roll_dice", ({ roomId }) => {
      try {
        const room = gameManager.getRoom(roomId);
        if (!room) {
          socket.emit("error_message", "Room not found!");
          return;
        }
        if (room.gameStatus !== gameManager.GAME_STATUS.PLAYING) {
          socket.emit("error_message", "Game hasn't started yet!");
          return;
        }
        if (socket.id !== room.currentTurn) {
          socket.emit("error_message", "Not your turn!");
          return;
        }

        // Clear turn timeout since player is actively playing
        gameManager.clearTurnTimeout(roomId);
        if (
          room.lastRoll &&
          room.lastRoll.roller === socket.id &&
          !room.lastRoll.moved
        ) {
          socket.emit(
            "error_message",
            "You must move a piece before rolling again!"
          );
          return;
        }
        io.to(roomId).emit("rolling_dice");
        setTimeout(() => {
          try {
            const gameState = gameManager.getGameState(roomId);
            const playerColor = room.players.find(
              (p) => p.id === socket.id
            )?.color;

            // Check if this is the player's first roll (all pieces are in home)
            const isFirstRoll = !gameState.pieces[playerColor]?.some(
              (piece) => piece && !piece.startsWith(`${playerColor[0]}h`)
            );

            let value;
            if (isFirstRoll) {
              // First roll: always roll 6 to ensure player can move
              value = 6;
              console.log(
                `[RollDice] First roll for ${socket.user.username}, forcing value 6`
              );
            } else {
              // Subsequent rolls: use safe roll logic
              value = getSafeRollValue(gameState.pieces, playerColor);
            }
            room.lastRoll = {
              value,
              roller: socket.id,
              moved: false,
            };
            io.to(roomId).emit("roll_dice", {
              value,
              roller: socket.id,
              dieStatus: gameManager.DIE_STATUS.ROLLING,
            });

            // Immediately emit room_update with lastRoll so frontend knows who rolled
            io.to(roomId).emit("room_update", {
              players: room.players,
              currentTurn: room.currentTurn,
              gameStatus: room.gameStatus,
              lastRoll: room.lastRoll,
            });
            const hasPiecesOutside = gameState.pieces[playerColor]?.some(
              (piece) => piece && !piece.startsWith(`${playerColor[0]}h`)
            );
            if (!hasPiecesOutside && value !== 6) {
              const nextIndex =
                (room.players.findIndex((p) => p.id === socket.id) + 1) %
                room.players.length;
              room.currentTurn = room.players[nextIndex].id;
              io.to(roomId).emit("room_update", {
                players: room.players,
                currentTurn: room.currentTurn,
                gameStatus: room.gameStatus,
                lastRoll: room.lastRoll,
              });

              // Start turn timeout for next player
              startTurnTimeout(io, roomId);
              return;
            }
            const movableTokens = getMovableTokens(
              gameState.pieces,
              playerColor,
              value
            );
            if (movableTokens.length === 1) {
              // Only one move, auto-move it
              setTimeout(() => {
                try {
                  socket.emit("auto_move", {
                    color: playerColor,
                    pieceIndex: movableTokens[0],
                  });
                } catch (error) {
                  console.error(
                    `Error sending auto_move to player in room ${roomId}:`,
                    error
                  );
                }
              }, 500);
            }
            // Use the same logic as getMovableTokens to ensure consistency
            const availableMoves = getMovableTokens(
              gameState.pieces,
              playerColor,
              value
            );
            const canMove = availableMoves.length > 0;
            console.log(
              `Player ${socket.user.username} rolled ${value}, availableMoves=${availableMoves.length}, canMove=${canMove}`
            );
            if (!canMove) {
              console.log(
                `No moves possible, advancing turn from ${socket.user.username} to next player`
              );
              const nextIndex =
                (room.players.findIndex((p) => p.id === socket.id) + 1) %
                room.players.length;
              const oldTurn = room.currentTurn;
              room.currentTurn = room.players[nextIndex].id;

              console.log(
                `[RollDice] Turn advanced from ${oldTurn} to ${room.currentTurn} because no moves available`
              );
              console.log(`[RollDice] Next player:`, room.players[nextIndex]);
              console.log(
                `[RollDice] Next player isBot:`,
                room.players[nextIndex].isBot
              );

              // Emit room update immediately to ensure frontend gets the new turn
              io.to(roomId).emit("room_update", {
                players: room.players,
                currentTurn: room.currentTurn,
                gameStatus: room.gameStatus,
                lastRoll: room.lastRoll,
              });

              // Notify bot controller about turn change immediately (only if bots are enabled)
              if (room.currentTurn && BOT_CONFIG.BOTS_ENABLED) {
                console.log(
                  `[RollDice] Notifying bot controller about turn change to ${room.currentTurn} in room ${roomId}`
                );
                console.log(`[RollDice] Bot controller object:`, botController);
                console.log(
                  `[RollDice] Bot controller handleTurnChange method:`,
                  typeof botController.handleTurnChange
                );
                console.log(
                  `[RollDice] Next player details:`,
                  room.players.find((p) => p.id === room.currentTurn)
                );

                try {
                  console.log(
                    `[RollDice] Calling botController.handleTurnChange(${roomId}, ${room.currentTurn})`
                  );
                  botController.handleTurnChange(roomId, room.currentTurn);
                  console.log(
                    `[RollDice] Bot controller handleTurnChange called successfully`
                  );
                } catch (error) {
                  console.error(
                    `[RollDice] Error calling bot controller handleTurnChange:`,
                    error
                  );
                }
              }

              // Return early since turn has been advanced
              return;
            }
            // Remove duplicate emissions since we handle them immediately when no moves are available
            // io.to(roomId).emit("room_update", {
            //   players: room.players,
            //   currentTurn: room.currentTurn,
            //   gameStatus: room.gameStatus,
            //   lastRoll: room.lastRoll,
            // });

            // Notify bot controller about turn change
            // if (room.currentTurn) {
            //   botController.handleTurnChange(roomId, room.currentTurn);
            // }

            maybeTriggerAutoMove(io, roomId);

            // Restart turn timeout since player is actively playing
            startTurnTimeout(io, roomId);
          } catch (error) {
            console.error(
              `Error in roll_dice timeout for room ${roomId}:`,
              error
            );
            io.to(roomId).emit(
              "error_message",
              "An error occurred during dice roll"
            );
          }
        }, 1000);
      } catch (error) {
        console.error(`Error in roll_dice for room ${roomId}:`, error);
        socket.emit("error_message", "Failed to roll dice");
        if (roomId) {
          io.to(roomId).emit(
            "error_message",
            "An error occurred while rolling dice"
          );
        }
      }
    });

    socket.on("move_piece", async ({ roomId, color, pieceIndex }) => {
      try {
        const room = gameManager.getRoom(roomId);
        if (!room) {
          socket.emit("error_message", "Room not found!");
          return;
        }
        if (room.gameStatus !== gameManager.GAME_STATUS.PLAYING) {
          socket.emit("error_message", "Game hasn't started yet!");
          return;
        }
        if (socket.id !== room.currentTurn) {
          socket.emit("error_message", "Not your turn!");
          return;
        }
        if (!room.lastRoll || room.lastRoll.roller !== socket.id) {
          socket.emit("error_message", "You must roll the dice first!");
          return;
        }
        if (room.lastRoll.moved) {
          socket.emit("error_message", "You must roll the dice again!");
          return;
        }

        // Clear turn timeout since player is actively playing
        gameManager.clearTurnTimeout(roomId);
        const gameState = gameManager.getGameState(roomId);
        const piece = gameState.pieces[color][pieceIndex];
        if (piece === `${color}WinZone`) {
          socket.emit(
            "error_message",
            "This piece has already won and cannot be moved!"
          );
          return;
        }
        const rollValue = room.lastRoll.value;

        // Check if there are any movable tokens at all for this roll
        const movableTokens = getMovableTokens(
          gameState.pieces,
          color,
          rollValue
        );
        if (movableTokens.length === 0) {
          console.log(
            `[MovePiece] No movable tokens for player ${socket.user.username} with roll ${rollValue}, advancing turn`
          );

          // Advance turn to next player since no moves are possible
          const nextIndex =
            (room.players.findIndex((p) => p.id === socket.id) + 1) %
            room.players.length;
          const oldTurn = room.currentTurn;
          room.currentTurn = room.players[nextIndex].id;

          console.log(
            `[MovePiece] Turn advanced from ${oldTurn} to ${room.currentTurn} because no movable tokens`
          );

          // Emit room update with new turn
          io.to(roomId).emit("room_update", {
            players: room.players,
            currentTurn: room.currentTurn,
            gameStatus: room.gameStatus,
            lastRoll: room.lastRoll,
          });

          // Notify bot controller about turn change
          if (room.currentTurn) {
            console.log(
              `[MovePiece] Notifying bot controller about turn change to ${room.currentTurn} in room ${roomId}`
            );
            console.log(`[MovePiece] Bot controller object:`, botController);
            console.log(
              `[MovePiece] Bot controller handleTurnChange method:`,
              typeof botController.handleTurnChange
            );

            try {
              botController.handleTurnChange(roomId, room.currentTurn);
              console.log(
                `[MovePiece] Bot controller handleTurnChange called successfully`
              );
            } catch (error) {
              console.error(
                `[MovePiece] Error calling bot controller handleTurnChange:`,
                error
              );
            }
          }

          return;
        }

        const nextPosition = getNextPosition(piece, rollValue, color);
        if (!nextPosition) {
          socket.emit("error_message", "Invalid move!");
          return;
        }
        function generateNewPath(currentPosition, rollValue, color) {
          const path = paths[color];
          if (!path) return null;
          const currentIndex = path.indexOf(currentPosition);
          if (currentIndex === -1) return null;
          let newIndex = currentIndex + rollValue;
          if (newIndex >= path.length) newIndex = path.length - 1;
          const newPath = path.slice(currentIndex, newIndex + 1);
          return newPath;
        }
        const killedPiece = Object.entries(gameState.pieces).find(
          ([pieceColor, pieces]) => {
            if (pieceColor === color) return false;
            return pieces.some(
              (p) => p === nextPosition && !isSafePosition(nextPosition)
            );
          }
        );
        let killedPieceInfo = null;
        if (killedPiece) {
          const [killedColor, killedPieces] = killedPiece;
          const killedIndex = killedPieces.indexOf(nextPosition);
          killedPieceInfo = {
            color: killedColor,
            index: killedIndex,
            position: nextPosition,
          };
        }
        gameState.pieces[color][pieceIndex] = nextPosition;
        room.lastRoll.moved = true;
        if (nextPosition === `${color}WinZone`) {
          io.to(roomId).emit("piece_finished", { color, pieceIndex });
        }
        if (
          hasPlayerWon(
            gameState.pieces,
            color,
            room.gameSettings.requiredPieces
          )
        ) {
          room.gameStatus = gameManager.GAME_STATUS.FINISHED;
          const winner = room.players.find((p) => p.color === color);
          const loser = room.players.find((p) => p.color !== color);
          const winnerPiecesInWinZone = gameState.pieces[color].filter(
            (piece) => piece === `${color}WinZone`
          ).length;
          const loserPiecesInWinZone = gameState.pieces[loser.color].filter(
            (piece) => piece === `${color}WinZone`
          ).length;
          console.log(
            `[MovePiece] Creating GameHistory record for win in room ${roomId}`
          );
          console.log(`[MovePiece] Winner:`, winner);
          console.log(`[MovePiece] Socket user:`, socket.user);

          const gameHistoryRecord = await GameHistory.create({
            user: socket.user.id,
            roomId,
            status: gameManager.GAME_STATUS.FINISHED,
            players: room.players,
            winnerId: winner?.userId,
            stake: room.gameSettings.stake,
            requiredPieces: room.gameSettings.requiredPieces,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          console.log(
            `[MovePiece] Game history saved successfully:`,
            gameHistoryRecord._id
          );
          const matchResults = {
            winner: {
              id: winner.id,
              name: winner.name,
              color: winner.color,
              piecesInWinZone: winnerPiecesInWinZone,
              totalPieces: gameState.pieces[color].length,
              pieces: gameState.pieces[color],
              isBot: winner.isBot || false,
            },
            loser: {
              id: loser.id,
              name: loser.name,
              color: loser.color,
              piecesInWinZone: loserPiecesInWinZone,
              totalPieces: gameState.pieces[loser.color].length,
              pieces: gameState.pieces[loser.color],
              isBot: loser.isBot || false,
            },
            gameDuration: Date.now() - room.createdAt,
            requiredPieces: room.gameSettings.requiredPieces,
            stake: room.gameSettings.stake,
          };

          // Update winner's wallet with game winnings
          try {
            const {
              addGameWinnings,
            } = require("../controllers/wallet.controller");
            const isBotGame = room.players.some((p) => p.isBot);

            await addGameWinnings(
              winner.userId,
              room.gameSettings.stake,
              roomId,
              isBotGame
            );
            console.log(
              `[MovePiece] Added winnings to winner ${winner.name} in room ${roomId}`
            );

            // Note: Bot controller is notified via handleGameEnd below
            // No need for additional human win handling since wallet is already updated
          } catch (error) {
            console.error(
              `[MovePiece] Error updating winner's wallet in room ${roomId}:`,
              error
            );
          }

          io.to(roomId).emit("game_over", matchResults);

          // Notify bot controller about game end
          botController.handleGameEnd(roomId);
        }
        if (
          rollValue !== 6 &&
          !killedPieceInfo &&
          nextPosition !== `${color}WinZone`
        ) {
          const nextIndex =
            (room.players.findIndex((p) => p.id === socket.id) + 1) %
            room.players.length;
          const oldTurn = room.currentTurn;
          room.currentTurn = room.players[nextIndex].id;
          console.log(
            `[MovePiece] Turn advanced from ${oldTurn} to ${room.currentTurn} in room ${roomId}`
          );
          console.log(
            `[MovePiece] Current player index: ${room.players.findIndex(
              (p) => p.id === socket.id
            )}, Next player index: ${nextIndex}`
          );
          console.log(`[MovePiece] Next player:`, room.players[nextIndex]);
        } else {
          console.log(
            `[MovePiece] Turn not advanced in room ${roomId}. Roll: ${rollValue}, Killed piece: ${!!killedPieceInfo}, Next position: ${nextPosition}`
          );

          // Restart turn timeout since player gets another turn
          startTurnTimeout(io, roomId);
        }
        const path = generateNewPath(piece, rollValue, color);
        emitPathStepByStep(
          roomId,
          color,
          pieceIndex,
          path,
          io,
          nextPosition,
          killedPieceInfo,
          gameState
        )
          .then(() => {
            try {
              io.to(roomId).emit("piece_moved", {
                pieces: gameState.pieces,
                path: path,
                color: color,
                index: pieceIndex,
              });
              io.to(roomId).emit("room_update", {
                players: room.players,
                currentTurn: room.currentTurn,
                gameStatus: room.gameStatus,
                lastRoll: room.lastRoll,
              });

              // Start turn timeout for next player
              startTurnTimeout(io, roomId);

              // Notify bot controller about turn change (only if bots are enabled)
              if (room.currentTurn && BOT_CONFIG.BOTS_ENABLED) {
                console.log(
                  `[MovePiece] Notifying bot controller about turn change to ${room.currentTurn} in room ${roomId}`
                );
                console.log(
                  `[MovePiece] Room players:`,
                  room.players.map((p) => ({
                    id: p.id,
                    name: p.name,
                    isBot: p.isBot,
                  }))
                );
                console.log(
                  `[MovePiece] Current turn player:`,
                  room.players.find((p) => p.id === room.currentTurn)
                );
                if (BOT_CONFIG.BOTS_ENABLED) {
                  botController.handleTurnChange(roomId, room.currentTurn);
                }
              } else {
                console.log(
                  `[MovePiece] No currentTurn set, not notifying bot controller in room ${roomId}`
                );
              }

              maybeTriggerAutoMove(io, roomId);
            } catch (error) {
              console.error(
                `Error in move_piece callback for room ${roomId}:`,
                error
              );
              io.to(roomId).emit(
                "error_message",
                "An error occurred while updating game state"
              );
            }
          })
          .catch((error) => {
            console.error(
              `Error in move_piece emitPathStepByStep for room ${roomId}:`,
              error
            );
            io.to(roomId).emit(
              "error_message",
              "An error occurred during piece movement"
            );
          });
      } catch (error) {
        console.error(`Error in move_piece for room ${roomId}:`, error);
        socket.emit("error_message", "Failed to move piece");
        if (roomId) {
          io.to(roomId).emit(
            "error_message",
            "An error occurred while moving piece"
          );
        }
      }
    });

    socket.on("disconnect", async () => {
      try {
        for (const roomId of gameManager.getAllRoomIds()) {
          try {
            const room = gameManager.getRoom(roomId);
            if (!room) continue;

            const playerIndex = room.players.findIndex(
              (p) => p.id === socket.id
            );
            if (playerIndex !== -1) {
              const disconnectedPlayer = room.players[playerIndex];

              // Clear existing auto-move timer if any
              gameManager.clearAutoMoveTimer(roomId, socket.id);
              if (room.gameStatus === gameManager.GAME_STATUS.PLAYING) {
                // Start 30s timer to mark as disconnected (not to auto-move all at once)
                const timer = setTimeout(() => {
                  try {
                    console.log(
                      `[DISCONNECT] 30s timer expired for player ${socket.id} in room ${roomId}. Checking for auto-move.`
                    );
                    // Player is now officially disconnected. If it's their turn, trigger the auto-move.
                    // maybeTriggerAutoMove will handle the check to see if it's the correct player's turn.
                    maybeTriggerAutoMove(io, roomId);
                  } catch (error) {
                    console.error(
                      `Error in disconnect timer callback for room ${roomId}:`,
                      error
                    );
                  }
                }, 30000);

                gameManager.setAutoMoveTimer(roomId, socket.id, timer);
                gameManager.addDisconnectedPlayer(roomId, socket.id, {
                  timeoutId: timer,
                  disconnectedAt: Date.now(),
                  color: disconnectedPlayer.color,
                  playerName: disconnectedPlayer.name,
                });
                gameManager.incrementAutoMoveCount(roomId, socket.id); // Initialize to 1
                io.to(roomId).emit("player_disconnected", {
                  playerId: socket.id,
                  playerName: disconnectedPlayer.name,
                  timeout: 30,
                });
                console.log(
                  `[DISCONNECT] Player ${socket.id} disconnected from room ${roomId}, 30s timer started.`
                );
                // --- NEW LOGIC: If all players are disconnected, end game and clear timers ---
                const allDisconnected = room.players.every((p) =>
                  gameManager.getDisconnectedPlayer(roomId, p.id)
                );
                if (allDisconnected) {
                  // Cancel all timers for this room
                  const roomState = gameManager.getRoom(roomId);
                  if (roomState) {
                    roomState.disconnectedAutoMoveTimers.forEach((timer) =>
                      clearTimeout(timer)
                    );
                    roomState.disconnectedAutoMoveTimers.clear();
                  }
                  // Mark game as finished and both as losers
                  room.gameStatus = gameManager.GAME_STATUS.FINISHED;
                  io.to(roomId).emit("game_over", {
                    reason: "both_disconnected",
                    losers: room.players.map((p) => ({
                      id: p.id,
                      name: p.name,
                      color: p.color,
                    })),
                  });
                  // Optionally, update DB or GameHistory here as needed
                }
              }
              // gameroom.find()
              // room.players.splice(playerIndex, 1); // Do not remove player on disconnect, keep for auto-move
              if (room.players.length === 0) {
                const deletionTimeoutId = setTimeout(async () => {
                  try {
                    await GameRoom.updateOne(
                      { roomId },
                      { $set: { gameStatus: gameManager.GAME_STATUS.FINISHED } }
                    );
                    gameManager.deleteRoom(roomId);
                    if (gameManager.getWaitingRoom() === roomId)
                      gameManager.setWaitingRoom(null);
                    const availableGames = await getAvailableGames(
                      socket.user.id
                    );
                    io.emit("available_games", availableGames);
                  } catch (error) {
                    console.error(
                      `Error deleting room ${roomId} after all players disconnected:`,
                      error
                    );
                  }
                }, 30000);
              } else {
                // Do not advance the turn here. Let the auto-move logic handle it.
                io.to(roomId).emit("room_update", {
                  players: room.players,
                  currentTurn: room.currentTurn,
                  gameStatus: room.gameStatus,
                });
              }
              const availableGames = await getAvailableGames(socket.user.id);
              io.emit("available_games", availableGames);
            }
          } catch (error) {
            console.error(
              `Error handling disconnect for room ${roomId}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error("Error in disconnect handler:", error);
      }
    });

    socket.on("reconnect_to_room", ({ roomId }) => {
      try {
        const disconnectedPlayer = gameManager.getDisconnectedPlayer(
          roomId,
          socket.id
        );
        if (disconnectedPlayer) {
          clearTimeout(disconnectedPlayer.timeoutId);
          gameManager.clearAutoMoveTimer(roomId, socket.id);
          gameManager.removeDisconnectedPlayer(roomId, socket.id);
          // Reset auto-move count for this player
          const room = gameManager.getRoom(roomId);
          if (room) {
            room.autoMoveCount.delete(socket.id);
          }
          // Rejoin the socket to the room
          socket.join(roomId);

          // Emit fresh game data to the reconnecting player
          if (room) {
            socket.emit("gameData", {
              players: room.players,
              currentTurn: room.currentTurn,
              gameStatus: room.gameStatus,
              gameSettings: room.gameSettings,
              lastRoll: room.lastRoll,
            });
          }

          io.to(roomId).emit("player_reconnected", {
            playerId: socket.id,
            playerName: socket.user.username,
          });
          console.log(
            `[RECONNECT] Player ${socket.id} reconnected to room ${roomId}, timer cleared.`
          );
        }
      } catch (error) {
        console.error(`Error in reconnect_to_room for room ${roomId}:`, error);
        socket.emit("error_message", "Failed to reconnect to room");
        if (roomId) {
          io.to(roomId).emit(
            "error_message",
            "An error occurred during reconnection"
          );
        }
      }
    });
    // --- End migrated socket event logic ---

    // Wallet and Balance Socket Events
    socket.on("get_wallet_balance", async () => {
      try {
        const Wallet = require("../model/Wallet");
        let wallet = await Wallet.findOne({ user: socket.user.id });

        if (!wallet) {
          wallet = new Wallet({ user: socket.user.id, balance: 0 });
          await wallet.save();
        }

        socket.emit("wallet_balance", { balance: wallet.balance });
      } catch (error) {
        console.error("Error getting wallet balance:", error);
        socket.emit("error_message", "Failed to get wallet balance");
      }
    });

    socket.on("get_transactions", async () => {
      try {
        const Transaction = require("../model/Transaction");
        const transactions = await Transaction.find({ user: socket.user.id })
          .sort({ createdAt: -1 })
          .limit(10);

        socket.emit("transactions_list", { transactions });
      } catch (error) {
        console.error("Error getting transactions:", error);
        socket.emit("error_message", "Failed to get transactions");
      }
    });

    // Handle leave room request
    socket.on("leave_room", async ({ roomId }) => {
      try {
        console.log(
          `[LEAVE_ROOM] Player ${socket.id} attempting to leave room ${roomId}`
        );

        const room = gameManager.getRoom(roomId);
        if (!room) {
          socket.emit("error_message", "Room not found!");
          return;
        }

        const playerIndex = room.players.findIndex((p) => p.id === socket.id);
        if (playerIndex === -1) {
          socket.emit("error_message", "You are not in this room!");
          return;
        }

        const leavingPlayer = room.players[playerIndex];
        const isHost = room.hostId === socket.user.id;
        const isOnlyPlayer = room.players.length === 1;

        // If host is leaving and they're the only player, delete the room
        if (
          isHost &&
          isOnlyPlayer &&
          room.gameStatus === gameManager.GAME_STATUS.WAITING
        ) {
          console.log(
            `[LEAVE_ROOM] Host ${socket.id} is only player - deleting room ${roomId}`
          );

          try {
            // Delete from database
            await GameRoom.deleteOne({ roomId });
            console.log(`[LEAVE_ROOM] Room ${roomId} deleted from database`);

            // Delete from memory
            gameManager.deleteRoom(roomId);
            console.log(`[LEAVE_ROOM] Room ${roomId} deleted from memory`);

            // Leave the socket room
            socket.leave(roomId);

            // Emit room deleted event
            socket.emit("room_deleted", {
              roomId,
              message: "Room deleted successfully",
            });

            // Update available games for all clients
            const availableGames = await getAvailableGames(socket.user.id);
            io.emit("available_games", availableGames);

            console.log(`[LEAVE_ROOM] Room ${roomId} successfully deleted`);
            return;
          } catch (error) {
            console.error(`[LEAVE_ROOM] Error deleting room ${roomId}:`, error);
            socket.emit("error_message", "Failed to delete room");
            return;
          }
        }

        // For non-host or multi-player rooms, handle as regular disconnect
        console.log(
          `[LEAVE_ROOM] Regular leave for player ${socket.id} in room ${roomId}`
        );

        // Remove player from room
        room.players.splice(playerIndex, 1);

        // Leave the socket room
        socket.leave(roomId);

        // Clear any timers for this player
        gameManager.clearAutoMoveTimer(roomId, socket.id);
        gameManager.removeDisconnectedPlayer(roomId, socket.id);

        // If no players left, clean up the room
        if (room.players.length === 0) {
          try {
            await GameRoom.deleteOne({ roomId });
            gameManager.deleteRoom(roomId);
            console.log(`[LEAVE_ROOM] Empty room ${roomId} deleted`);
          } catch (error) {
            console.error(
              `[LEAVE_ROOM] Error deleting empty room ${roomId}:`,
              error
            );
          }
        } else if (
          room.gameStatus === gameManager.GAME_STATUS.PLAYING &&
          room.players.length === 1
        ) {
          // Player left during active game - remaining player wins automatically
          console.log(
            `[LEAVE_ROOM] Player left during active game - awarding win to remaining player`
          );

          const winner = room.players[0];
          const loser = leavingPlayer;
          const gameState = gameManager.getGameState(roomId);

          // Mark game as finished
          room.gameStatus = gameManager.GAME_STATUS.FINISHED;

          try {
            // Create game history record
            console.log(
              `[LEAVE_ROOM] Creating GameHistory record for room ${roomId}`
            );

            const gameHistoryRecord = await GameHistory.create({
              user: winner?.userId,
              roomId,
              status: gameManager.GAME_STATUS.FINISHED,
              players: [winner, loser], // Include both players in history
              winnerId: winner?.userId,
              stake: room.gameSettings.stake,
              requiredPieces: room.gameSettings.requiredPieces,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            console.log(
              `[LEAVE_ROOM] Game history saved successfully:`,
              gameHistoryRecord._id
            );
          } catch (error) {
            console.error(
              `[LEAVE_ROOM] Error saving game history for leave win in room ${roomId}:`,
              error
            );
          }

          // Update winner's wallet with game winnings
          try {
            const {
              addGameWinnings,
            } = require("../controllers/wallet.controller");
            const isBotGame = room.players.some((p) => p.isBot);

            await addGameWinnings(
              winner.userId,
              room.gameSettings.stake,
              roomId,
              isBotGame
            );
            console.log(
              `[LEAVE_ROOM] Added winnings to winner ${winner.name} in room ${roomId}`
            );
          } catch (error) {
            console.error(
              `[LEAVE_ROOM] Error updating winner's wallet in room ${roomId}:`,
              error
            );
          }

          // Create match results for the winner
          const matchResults = {
            winner: {
              id: winner.id,
              name: winner.name,
              color: winner.color,
              pieces: gameState?.pieces?.[winner.color] || [],
              isBot: winner.isBot || false,
            },
            loser: {
              id: loser.id,
              name: loser.name,
              color: loser.color,
              pieces: gameState?.pieces?.[loser.color] || [],
              isBot: loser.isBot || false,
            },
            gameDuration: Date.now() - room.createdAt,
            requiredPieces: room.gameSettings.requiredPieces,
            stake: room.gameSettings.stake,
            reason: "opponent_left", // Add reason for frontend handling
          };

          console.log(`[LEAVE_ROOM] Match results:`, matchResults);

          // Emit game over to remaining player
          io.to(roomId).emit("game_over", matchResults);

          // Notify bot controller about game end
          botController.handleGameEnd(roomId);

          console.log(
            `[LEAVE_ROOM] Player ${winner.name} won due to opponent leaving in room ${roomId}`
          );
        } else {
          // Update remaining players (for waiting rooms or multiple players)
          io.to(roomId).emit("player_left", {
            playerId: socket.id,
            playerName: leavingPlayer.name,
            remainingPlayers: room.players.length,
          });

          // If game was playing and current player left, advance turn
          if (
            room.gameStatus === gameManager.GAME_STATUS.PLAYING &&
            room.currentTurn === socket.id
          ) {
            const nextIndex =
              playerIndex >= room.players.length ? 0 : playerIndex;
            room.currentTurn = room.players[nextIndex].id;

            io.to(roomId).emit("room_update", {
              players: room.players,
              currentTurn: room.currentTurn,
              gameStatus: room.gameStatus,
            });
          }
        }

        // Emit confirmation to leaving player
        socket.emit("left_room", { roomId });

        // Update available games
        const availableGames = await getAvailableGames(socket.user.id);
        io.emit("available_games", availableGames);

        console.log(
          `[LEAVE_ROOM] Player ${socket.id} successfully left room ${roomId}`
        );
      } catch (error) {
        console.error(`[LEAVE_ROOM] Error handling leave room:`, error);
        socket.emit("error_message", "Failed to leave room");
      }
    });

    socket.on("get_notifications", async () => {
      try {
        const Notification = require("../model/Notification");
        const notifications = await Notification.find({ user: socket.user.id })
          .sort({ createdAt: -1 })
          .limit(20);

        const unreadCount = await Notification.countDocuments({
          user: socket.user.id,
          status: "UNREAD",
        });

        socket.emit("notifications_list", { notifications, unreadCount });
      } catch (error) {
        console.error("Error getting notifications:", error);
        socket.emit("error_message", "Failed to get notifications");
      }
    });

    socket.on("mark_notification_read", async ({ notificationId }) => {
      try {
        const Notification = require("../model/Notification");
        await Notification.findOneAndUpdate(
          { _id: notificationId, user: socket.user.id },
          { status: "READ" }
        );

        socket.emit("notification_updated", { notificationId, status: "READ" });
      } catch (error) {
        console.error("Error marking notification as read:", error);
        socket.emit("error_message", "Failed to update notification");
      }
    });

    socket.on("mark_all_notifications_read", async () => {
      try {
        const Notification = require("../model/Notification");
        await Notification.updateMany(
          { user: socket.user.id, status: "UNREAD" },
          { status: "READ" }
        );

        socket.emit("all_notifications_read");
      } catch (error) {
        console.error("Error marking all notifications as read:", error);
        socket.emit("error_message", "Failed to update notifications");
      }
    });
  });

  // Cleanup inactive rooms every hour
  setInterval(async () => {
    try {
      const deletedCount = gameManager.cleanupInactiveRooms(3600000); // 1 hour
      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} inactive rooms`);
        // Emit updated available games to all clients
        io.emit("available_games", []);
      }
    } catch (error) {
      console.error("Error in cleanup interval:", error);
    }
  }, 3600000);
}

module.exports = registerSocketHandlers;
