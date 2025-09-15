// /ai/GladiatorAI.js
const {
  getMovableTokens, // if you have it, used optionally
  getNextPosition, // MUST be your canonical pathing (color-aware home rows)
  isSafePosition, // expects something like 'p42' or your engine’s format
} = require("../../utils");

/**
 * GladiatorAI — ultra-hard Ludo bot
 * - Honors "requiredPieces" (how many tokens must reach win/home to win).
 * - NEVER lands on own piece (no stacking) unless the square is SAFE.
 * - Ruthless heuristic + adversarial look-ahead (worst-case opponent reply).
 * - Emergency defense: prioritizes escaping imminent captures.
 */
class GladiatorAI {
  constructor() {
    this.rules = {
      requiredPieces: 4, // how many tokens must be in home to win
      boardEnd: 56, // adjust to your board config
      punishWeight: 0.85, // how much to fear the opponent’s best reply (0..1)
      emergencyWeight: 1200, // urgency to dodge captures this turn
      captureWeight: 1400,
      safeBonus: 450,
      bringOutBonus: 800,
      progressWeight: 420,
      homeEntryBonus: 1100,
      finishBonus: 5200, // finishing the match trumps everything
      blockSafeOverride: true, // allow own-on-own ONLY if safe square
      tieNoise: 0.0001, // deterministic but breaks ties by minor piece index bias
    };
  }

  chooseMove(gameState, playerId, dice, rules = null) {
    if (rules) this.rules = { ...this.rules, ...rules };

    const player = gameState.players.find((p) => p.id === playerId);
    if (!player) return null;

    const legalMoves = this.getLegalMoves(gameState, player, dice);
    if (legalMoves.length === 0) return null;

    // Score + shallow adversarial look-ahead (worst opponent reply this ply)
    const scored = legalMoves.map((move) => {
      const after = this.simulateMove(gameState, playerId, move);
      const baseScore = this.scoreMove(gameState, playerId, move, dice);

      // Worst-case opponent punishment (any opponent, any dice 1..6)
      const punish = this.estimateWorstOpponentPunish(after, playerId);

      // Emergency: if current state had threats and this move removes them, big bonus
      const emergencyDelta = this.emergencyDefenseBonus(
        gameState,
        after,
        playerId,
        move
      );

      const total =
        baseScore -
        this.rules.punishWeight * punish +
        emergencyDelta +
        this.rules.tieNoise * move.pieceIndex; // stable tie-break

      return { ...move, score: total };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  /**
   * LEGAL MOVES respecting:
   * - Bring out on 6
   * - No landing on own piece unless square is SAFE
   * - Respect your engine's getNextPosition (handles color & home rows)
   */
  getLegalMoves(gameState, player, dice) {
    const moves = [];
    const myColor = player.color;

    // Handle both old and new game state formats
    let pieces;
    if (gameState.board && gameState.board[myColor]) {
      // New format: gameState.board[color] = [{position, isHome, ...}, ...]
      pieces = gameState.board[myColor].map((p, i) => ({
        ...p,
        idx: i,
      }));
    } else if (gameState.pieces && gameState.pieces[myColor]) {
      // Old format: gameState.pieces[color] = ["rh1", "p0", ...]
      pieces = gameState.pieces[myColor].map((pos, i) => ({
        position: pos,
        isHome: pos === `${myColor}WinZone`,
        idx: i,
      }));
    } else {
      return moves;
    }

    for (const piece of pieces) {
      // Already home -> cannot move
      if (piece.isHome || piece.position === `${myColor}WinZone`) continue;

      // Not on board: only 6 can bring out
      if (
        piece.position === -1 ||
        (typeof piece.position === "string" &&
          piece.position.startsWith(`${myColor[0]}h`))
      ) {
        if (dice === 6) {
          const startPos = this.getStartingPosition(myColor);
          // If starting square has own piece and is NOT safe, skip (no stacking rule)
          const ownOnStart = this.ownPieceAt(gameState, myColor, startPos);
          const startSafe = this.safe(startPos);
          if (
            !ownOnStart ||
            (ownOnStart && startSafe && this.rules.blockSafeOverride)
          ) {
            moves.push({
              pieceIndex: piece.idx,
              fromPosition: piece.position,
              toPosition: startPos,
              isBringOut: true,
              willKill: this.wouldKillOpponent(gameState, startPos, myColor),
              landsOnSafeSquare: this.safe(startPos),
              createsOwnBlock: ownOnStart && this.safe(startPos),
              victimPlayerId: this.getPlayerAtPosition(gameState, startPos),
              progressNormalized: this.progressNorm(-1, startPos, myColor),
            });
          }
        }
        continue;
      }

      // On board: try moving
      const nextPos = this.getNextPosition(piece.position, dice, myColor);
      if (nextPos == null) continue;

      // If landing on own piece and not safe -> illegal under your rule
      const ownThere = this.ownPieceAt(gameState, myColor, nextPos);
      const safeThere = this.safe(nextPos);
      if (ownThere && !(safeThere && this.rules.blockSafeOverride)) continue;

      moves.push({
        pieceIndex: piece.idx,
        fromPosition: piece.position,
        toPosition: nextPos,
        isBringOut: false,
        willKill: this.wouldKillOpponent(gameState, nextPos, myColor),
        landsOnSafeSquare: safeThere,
        createsOwnBlock: ownThere && safeThere, // "stacking" only allowed on safe
        victimPlayerId: this.getPlayerAtPosition(gameState, nextPos),
        progressNormalized: this.progressNorm(piece.position, nextPos, myColor),
      });
    }

    return moves;
  }

  /** ---------- Scoring (ruthless) ---------- */
  scoreMove(gameState, playerId, move, dice) {
    const player = gameState.players.find((p) => p.id === playerId);
    const myColor = player.color;

    let s = 0;

    // Finishing priority via requiredPieces
    const tokensHomeNow = this.countTokensHome(gameState, myColor);
    const tokensHomeAfter =
      tokensHomeNow + (this.isHomeAfterMove(move, myColor) ? 1 : 0);

    if (tokensHomeAfter >= this.rules.requiredPieces) {
      s += this.rules.finishBonus; // immediate victory
    } else {
      // Home-entry progress is valuable
      if (this.isHomeEntry(move, myColor)) s += this.rules.homeEntryBonus;
      // Partial toward requirement
      s += tokensHomeAfter * 700;
    }

    // Capture is king (deny opponent progress—weighted by their threat)
    if (move.willKill) {
      const threat = this.estimateOpponentThreat(
        gameState,
        move.victimPlayerId
      );
      s += this.rules.captureWeight + 90 * threat;
    }

    // Safety & allowed protected “block” only on safe squares
    if (move.landsOnSafeSquare) s += this.rules.safeBonus;
    if (move.createsOwnBlock) s += 300;

    // Bring out advantage (especially early)
    if (move.isBringOut && dice === 6) {
      s += this.rules.bringOutBonus;

      // Extra bonus for bringing out with few kings (strategic advantage)
      const requiredPieces = this.rules.requiredPieces || this.rules.kings;
      if (requiredPieces <= 2) {
        s += 150; // Extra bonus for bringing out when playing with few kings
      }

      // Penalize bringing out if we already have enough active tokens to win
      const activeTokens = this.countActiveTokens(gameState, myColor);

      // For 1-piece games, heavily penalize bringing out if we already have 1 active token
      if (requiredPieces === 1 && activeTokens >= 1) {
        s -= 1500; // Very heavy penalty for bringing out in 1-piece games when we have an active token
        console.log(
          `[GladiatorAI] 1-piece game: Heavy penalty for bringing out when ${activeTokens} tokens are active`
        );
      }
      // For other games, only penalize if we have significantly more than required
      else if (
        activeTokens > requiredPieces &&
        !move.willKill &&
        !move.landsOnSafeSquare
      ) {
        s -= 1000; // Heavy penalty for bringing out when we have enough active tokens
        console.log(
          `[GladiatorAI] Penalty for bringing out: ${activeTokens} active > ${requiredPieces} required`
        );
      }
    }

    // Forward progress normalized
    s +=
      move.progressNormalized *
      this.rules.progressWeight *
      this.routeLen(myColor);

    // Risk after move (how killable is the landing square)
    const risk = this.riskAfterMove(gameState, playerId, move.toPosition);
    s -= risk * 1000;

    return s;
  }

  /** ---------- Adversarial Look-ahead ---------- */
  estimateWorstOpponentPunish(stateAfterMyMove, myPlayerId) {
    let worst = 0;
    for (const opp of stateAfterMyMove.players) {
      if (opp.id === myPlayerId) continue;
      // Simulate each dice 1..6, take opp’s single best “damage to me”
      let bestPunishForThisOpp = 0;
      for (let d = 1; d <= 6; d++) {
        const oppMoves = this.getLegalMoves(stateAfterMyMove, opp, d);
        for (const m of oppMoves) {
          // Heuristic of “how bad is this for me”
          // Prioritize: capture me, push toward their finish, break my safe presence.
          let harm = 0;
          if (m.willKill) harm += 1200;
          if (m.landsOnSafeSquare) harm += 200;
          if (this.isHomeEntry(m, opp.color)) harm += 600;
          harm += m.progressNormalized * 300;
          if (harm > bestPunishForThisOpp) bestPunishForThisOpp = harm;
        }
      }
      if (bestPunishForThisOpp > worst) worst = bestPunishForThisOpp;
    }
    return worst;
  }

  /** ---------- Emergency Defense (imminent capture escape) ---------- */
  emergencyDefenseBonus(stateBefore, stateAfter, myPlayerId, myMove) {
    const beforeThreat = this.imminentThreatOnSquare(
      stateBefore,
      myPlayerId,
      myMove.fromPosition
    );
    const afterThreat = this.imminentThreatOnSquare(
      stateAfter,
      myPlayerId,
      myMove.toPosition
    );
    // If we were threatened before and not threatened after—reward big
    if (beforeThreat > 0 && afterThreat === 0) {
      return this.rules.emergencyWeight * beforeThreat;
    }
    return 0;
  }

  imminentThreatOnSquare(gameState, myPlayerId, square) {
    if (square == null || square === -1) return 0;
    if (this.safe(square)) return 0;

    let max = 0;
    for (const opp of gameState.players) {
      if (opp.id === myPlayerId) continue;

      // Handle both old and new game state formats
      let oppPieces;
      if (gameState.board && gameState.board[opp.color]) {
        oppPieces = gameState.board[opp.color] || [];
      } else if (gameState.pieces && gameState.pieces[opp.color]) {
        oppPieces = gameState.pieces[opp.color].map((pos, i) => ({
          position: pos,
          isHome: pos === `${opp.color}WinZone`,
          idx: i,
        }));
      } else {
        continue;
      }

      for (const pc of oppPieces) {
        if (
          pc.isHome ||
          pc.position === -1 ||
          pc.position === `${opp.color}WinZone`
        )
          continue;
        // Can opponent reach 'square' with 1..6?
        for (let d = 1; d <= 6; d++) {
          const n = this.getNextPosition(pc.position, d, opp.color);
          if (n === square) {
            // Closer pieces imply higher immediacy
            const distance = Math.abs(
              this.positionToNumber(square) - this.positionToNumber(pc.position)
            );
            const r = Math.max(0.2, 1 - distance / 6);
            if (r > max) max = r;
          }
        }
      }
    }
    return max; // 0..1
  }

  /** ---------- Helpers ---------- */

  simulateMove(gameState, playerId, move) {
    // Lightweight deep clone for board & player tokens
    const cloned = {
      players: gameState.players.map((p) => ({ ...p })),
      board: {},
    };
    for (const color of Object.keys(gameState.board)) {
      cloned.board[color] = gameState.board[color].map((t) => ({ ...t }));
    }

    const player = cloned.players.find((p) => p.id === playerId);
    const myColor = player.color;

    // Apply the move
    const piece = cloned.board[myColor][move.pieceIndex];
    // Handle capture
    if (move.willKill && move.victimPlayerId) {
      for (const color of Object.keys(cloned.board)) {
        if (color === myColor) continue;
        cloned.board[color] = cloned.board[color].map((t) => {
          if (!t.isHome && t.position === move.toPosition) {
            return { ...t, position: -1 }; // send back to yard
          }
          return t;
        });
      }
    }

    // Move my piece
    if (move.isBringOut) {
      piece.position = move.toPosition;
    } else {
      piece.position = move.toPosition;
    }

    // Mark home if the engine defines “home” explicitly (adjust if different)
    if (this.isHomeSquare(move.toPosition, myColor)) {
      piece.isHome = true;
      // Optionally, you might set position to a sentinel like 100+idx etc.
    }

    return cloned;
  }

  ownPieceAt(gameState, color, position) {
    // Handle both old and new game state formats
    if (gameState.board && gameState.board[color]) {
      const arr = gameState.board[color] || [];
      return arr.some((p) => !p.isHome && p.position === position);
    } else if (gameState.pieces && gameState.pieces[color]) {
      const arr = gameState.pieces[color] || [];
      return arr.some((pos) => pos === position && pos !== `${color}WinZone`);
    }
    return false;
  }

  safe(pos) {
    // If your isSafePosition expects 'pXX' use that; else adapt
    return isSafePosition(typeof pos === "number" ? `p${pos}` : pos);
  }

  routeLen(color) {
    // If different per color, adjust. Defaults to 56 like your code.
    return this.rules.boardEnd;
  }

  progressNorm(from, to, color) {
    if (from === -1) return 0;
    const total = this.routeLen(color);
    const delta = Math.max(0, to - from);
    return Math.min(1, delta / total);
    // If your path wraps/enters home rows with color offsets, prefer a color-aware distance.
  }

  countTokensHome(gameState, color) {
    const arr = gameState.board[color] || [];
    return arr.filter(
      (p) => p.isHome === true || this.isHomeSquare(p.position, color)
    ).length;
  }

  countActiveTokens(gameState, color) {
    // Count tokens that are on the board (not at home and not in starting position)
    const arr = gameState.board[color] || [];
    return arr.filter(
      (p) =>
        !p.isHome &&
        p.position !== -1 &&
        !this.isHomeSquare(p.position, color) &&
        !(
          typeof p.position === "string" &&
          p.position.startsWith(`${color[0]}h`)
        )
    ).length;
  }

  isHomeAfterMove(move, color) {
    return this.isHomeSquare(move.toPosition, color);
  }

  isHomeEntry(move, color) {
    // Reward entering the final stretch / home row. If your engine exposes a helper, use it.
    // Fallback heuristic: close to the end.
    const nearHomeThreshold = this.rules.boardEnd - 6; // last 6 steps
    return move.toPosition >= nearHomeThreshold && !move.isBringOut;
  }

  isHomeSquare(pos, color) {
    // If your engine encodes "home" differently, replace this check:
    return typeof pos === "number" && pos >= this.rules.boardEnd;
  }

  riskAfterMove(gameState, myPlayerId, targetPos) {
    if (targetPos == null || targetPos === -1) return 0;
    if (this.safe(targetPos)) return 0;

    let maxRisk = 0;
    for (const opp of gameState.players) {
      if (opp.id === myPlayerId) continue;

      // Handle both old and new game state formats
      let oppPieces;
      if (gameState.board && gameState.board[opp.color]) {
        oppPieces = gameState.board[opp.color] || [];
      } else if (gameState.pieces && gameState.pieces[opp.color]) {
        oppPieces = gameState.pieces[opp.color].map((pos, i) => ({
          position: pos,
          isHome: pos === `${opp.color}WinZone`,
          idx: i,
        }));
      } else {
        continue;
      }

      for (const pc of oppPieces) {
        if (
          pc.isHome ||
          pc.position === -1 ||
          pc.position === `${opp.color}WinZone`
        )
          continue;
        for (let d = 1; d <= 6; d++) {
          const n = this.getNextPosition(pc.position, d, opp.color);
          if (n === targetPos) {
            const distance = Math.abs(
              this.positionToNumber(targetPos) -
                this.positionToNumber(pc.position)
            );
            const r = Math.max(0.15, 1 - distance / 6);
            if (r > maxRisk) maxRisk = r;
          }
        }
      }
    }
    return maxRisk; // 0..1
  }

  estimateOpponentThreat(gameState, victimPlayerId) {
    const opp = gameState.players.find((p) => p.id === victimPlayerId);
    if (!opp) return 0;
    const arr = gameState.board[opp.color] || [];

    let home = 0,
      onBoard = 0,
      progress = 0;
    for (const t of arr) {
      if (t.isHome || this.isHomeSquare(t.position, opp.color)) {
        home++;
      } else if (t.position !== -1) {
        onBoard++;
        progress += this.progressNorm(-1, t.position, opp.color);
      }
    }
    const avgProg = onBoard ? progress / onBoard : 0;
    const homeScore = Math.min(
      1,
      home / Math.max(1, this.rules.requiredPieces)
    );
    return Math.round(10 * (0.7 * homeScore + 0.3 * avgProg)); // 0..10
  }

  getStartingPosition(color) {
    // Return numeric positions for test compatibility
    const map = {
      red: 0,
      green: 13,
      yellow: 26,
      blue: 39,
    };
    return map[color] ?? 0;
  }

  wouldKillOpponent(gameState, position, myColor) {
    // Handle both old and new game state formats
    if (gameState.board) {
      for (const color of Object.keys(gameState.board)) {
        if (color === myColor) continue;
        const arr = gameState.board[color];
        for (const p of arr) {
          if (!p.isHome && p.position === position) return true;
        }
      }
    } else if (gameState.pieces) {
      for (const color of Object.keys(gameState.pieces)) {
        if (color === myColor) continue;
        const arr = gameState.pieces[color];
        for (const pos of arr) {
          if (pos === position && pos !== `${color}WinZone`) return true;
        }
      }
    }
    return false;
  }

  getPlayerAtPosition(gameState, position) {
    // Handle both old and new game state formats
    if (gameState.board) {
      for (const color of Object.keys(gameState.board)) {
        const arr = gameState.board[color];
        for (const p of arr) {
          if (!p.isHome && p.position === position) {
            return (
              gameState.players.find((pl) => pl.color === color)?.id ?? null
            );
          }
        }
      }
    } else if (gameState.pieces) {
      for (const color of Object.keys(gameState.pieces)) {
        const arr = gameState.pieces[color];
        for (const pos of arr) {
          if (pos === position && pos !== `${color}WinZone`) {
            return (
              gameState.players.find((pl) => pl.color === color)?.id ?? null
            );
          }
        }
      }
    }
    return null;
  }

  // Additional methods expected by tests for backward compatibility
  estimateOpponentThreatLevel(gameState, opponentId, rules) {
    return this.estimateOpponentThreat(gameState, opponentId);
  }

  estimateRiskAfterMove(gameState, playerId, move) {
    return this.riskAfterMove(gameState, playerId, move.toPosition);
  }

  opponentIsOneTokenFromWin(gameState, rules) {
    for (const player of gameState.players) {
      const pieces = this.getPiecesForColor(gameState, player.color);
      let tokensInWin = 0;

      for (const piece of pieces) {
        if (piece.isHome || piece.position === `${player.color}WinZone`)
          tokensInWin++;
      }

      if (tokensInWin >= rules.kings - 1) return true;
    }
    return false;
  }

  isInWinZone(position, color) {
    return (
      position === `${color}WinZone` ||
      (typeof position === "number" && position >= 50)
    ); // Win zone starts at 50
  }

  getNextPosition(currentPosition, dice, color) {
    // Convert numeric positions to string format for the utility function
    let positionStr = currentPosition;
    if (typeof currentPosition === "number") {
      if (currentPosition === -1) {
        positionStr = `${color[0]}h1`; // Default home position
      } else {
        positionStr = `p${currentPosition}`;
      }
    }

    const result = getNextPosition(positionStr, dice, color);

    // Convert result back to numeric if input was numeric
    if (typeof currentPosition === "number" && result) {
      if (result === `${color}WinZone`) {
        return 56; // Return numeric win zone position
      } else if (result.startsWith("p")) {
        return parseInt(result.substring(1));
      }
    }

    return result;
  }

  createsOwnBlock(gameState, position, playerColor) {
    return this.ownPieceAt(gameState, playerColor, position);
  }

  calculateProgress(fromPosition, toPosition, color) {
    if (fromPosition === -1) return 0;

    // Convert string positions to numeric for calculation
    const fromNum = this.positionToNumber(fromPosition);
    const toNum = this.positionToNumber(toPosition);

    if (fromNum === null || toNum === null) return 0;

    const totalDistance = 56;
    const distanceTraveled = toNum - fromNum;
    return Math.max(0, Math.min(1, distanceTraveled / totalDistance));
  }

  // Helper methods
  getPiecesForColor(gameState, color) {
    if (gameState.board && gameState.board[color]) {
      return gameState.board[color];
    } else if (gameState.pieces && gameState.pieces[color]) {
      return gameState.pieces[color].map((pos, i) => ({
        position: pos,
        isHome: pos === `${color}WinZone`,
        idx: i,
      }));
    }
    return [];
  }

  positionToNumber(position) {
    if (typeof position === "number") return position;
    if (typeof position === "string" && position.startsWith("p")) {
      return parseInt(position.substring(1));
    }
    return null;
  }
}

// For backward compatibility, also export as HardAI
class HardAI extends GladiatorAI {
  constructor() {
    super();
    // HardAI uses the same implementation as GladiatorAI
  }
}

module.exports = { GladiatorAI, HardAI };
