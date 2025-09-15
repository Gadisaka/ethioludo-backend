const { HardAI } = require("./hard");

// Mock Math.random for consistent testing
const originalRandom = Math.random;
let mockRandomValue = 0.5;

describe("HardAI", () => {
  let hardAI;
  let mockGameState;

  beforeEach(() => {
    hardAI = new HardAI();
    mockRandomValue = 0.5;
    Math.random = jest.fn(() => mockRandomValue);

    // Create a mock game state
    mockGameState = {
      players: [
        { id: "bot1", color: "red" },
        { id: "bot2", color: "green" },
        { id: "bot3", color: "yellow" },
        { id: "bot4", color: "blue" },
      ],
      board: {
        red: [
          { position: 0, isHome: false }, // Starting position
          { position: 10, isHome: false }, // On board
          { position: 45, isHome: false }, // Close to home
          { position: -1, isHome: false }, // Not on board
        ],
        green: [
          { position: 13, isHome: false }, // Starting position
          { position: 20, isHome: false }, // On board
          { position: 50, isHome: false }, // In win zone
          { position: -1, isHome: false }, // Not on board
        ],
        yellow: [
          { position: 26, isHome: false }, // Starting position
          { position: 30, isHome: false }, // On board
          { position: 52, isHome: false }, // In win zone
          { position: -1, isHome: false }, // Not on board
        ],
        blue: [
          { position: 39, isHome: false }, // Starting position
          { position: 40, isHome: false }, // On board
          { position: 54, isHome: false }, // In win zone
          { position: -1, isHome: false }, // Not on board
        ],
      },
    };
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  describe("chooseMove", () => {
    it("should return null when no legal moves available", () => {
      // Set all pieces to home or invalid positions
      mockGameState.board.red = [
        { position: 56, isHome: true },
        { position: 56, isHome: true },
        { position: 56, isHome: true },
        { position: 56, isHome: true },
      ];

      const result = hardAI.chooseMove(mockGameState, "bot1", 3);
      expect(result).toBeNull();
    });

    it("should return null when player not found", () => {
      const result = hardAI.chooseMove(mockGameState, "nonexistent", 6);
      expect(result).toBeNull();
    });

    it("should return best move based on scoring", () => {
      // Create a scenario where killing an opponent is the best move
      mockGameState.board.red[1].position = 19; // Can move to 25 and kill green piece
      mockGameState.board.green[1].position = 25; // Vulnerable piece

      const result = hardAI.chooseMove(mockGameState, "bot1", 6);

      expect(result).toBeDefined();
      expect(result.pieceIndex).toBe(1);
      expect(result.willKill).toBe(true);
      expect(result.victimPlayerId).toBe("bot2");
    });

    it("should prioritize bringing out pieces on six", () => {
      // Remove competitive moves by setting other pieces to home or invalid positions
      mockGameState.board.red[0].isHome = true;
      mockGameState.board.red[1].isHome = true; // Set to home instead of -1
      mockGameState.board.red[2].isHome = true;

      const result = hardAI.chooseMove(mockGameState, "bot1", 6);

      expect(result).toBeDefined();
      expect(result.isBringOut).toBe(true);
      expect(result.pieceIndex).toBe(3); // Piece not on board
    });

    it("should respect custom rules", () => {
      // Remove competitive moves by setting other pieces to home or invalid positions
      mockGameState.board.red[0].isHome = true;
      mockGameState.board.red[1].position = -1; // Not on board
      mockGameState.board.red[2].isHome = true;

      const customRules = { kings: 2 };
      const result = hardAI.chooseMove(mockGameState, "bot1", 6, customRules);

      expect(result).toBeDefined();
      // With 2 kings, bringing out should get extra bonus
      expect(result.isBringOut).toBe(true);
    });
  });

  describe("getLegalMoves", () => {
    it("should return bring out move when dice is 6", () => {
      const player = mockGameState.players[0]; // red player
      const moves = hardAI.getLegalMoves(mockGameState, player, 6);

      const bringOutMove = moves.find((m) => m.isBringOut);
      expect(bringOutMove).toBeDefined();
      expect(bringOutMove.pieceIndex).toBe(3); // Piece not on board
      expect(bringOutMove.toPosition).toBe(0); // Starting position for red
    });

    it("should not return bring out move when dice is not 6", () => {
      const player = mockGameState.players[0]; // red player
      const moves = hardAI.getLegalMoves(mockGameState, player, 3);

      const bringOutMove = moves.find((m) => m.isBringOut);
      expect(bringOutMove).toBeUndefined();
    });

    it("should calculate move properties correctly", () => {
      const player = mockGameState.players[0]; // red player
      const moves = hardAI.getLegalMoves(mockGameState, player, 5);

      const move = moves.find((m) => m.pieceIndex === 1); // Piece at position 10
      expect(move).toBeDefined();
      expect(move.fromPosition).toBe(10);
      expect(move.toPosition).toBe(15);
      expect(move.willKill).toBe(false);
      expect(move.landsOnSafeSquare).toBe(false);
      expect(move.progressNormalized).toBeGreaterThan(0);
    });

    it("should detect killing moves", () => {
      // Place red piece so it can kill green piece
      mockGameState.board.red[1].position = 19;
      mockGameState.board.green[1].position = 25;

      const player = mockGameState.players[0]; // red player
      const moves = hardAI.getLegalMoves(mockGameState, player, 6);

      const killMove = moves.find((m) => m.willKill);
      expect(killMove).toBeDefined();
      expect(killMove.victimPlayerId).toBe("bot2");
    });

    it("should skip pieces that are already home", () => {
      mockGameState.board.red[0].isHome = true;

      const player = mockGameState.players[0]; // red player
      const moves = hardAI.getLegalMoves(mockGameState, player, 6);

      const homeMove = moves.find((m) => m.pieceIndex === 0);
      expect(homeMove).toBeUndefined();
    });
  });

  describe("scoreMove", () => {
    it("should give huge bonus for winning the game", () => {
      // Set up scenario where move would complete the game
      const move = {
        pieceIndex: 2,
        toPosition: 50, // Win zone position
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 1,
      };

      // Set other pieces to home
      mockGameState.board.red[0].isHome = true;
      mockGameState.board.red[1].isHome = true;
      mockGameState.board.red[3].isHome = true;

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 6, {
        kings: 4,
      });
      expect(score).toBeGreaterThan(5000);
    });

    it("should score killing moves based on opponent threat", () => {
      const move = {
        pieceIndex: 1,
        toPosition: 25,
        isBringOut: false,
        willKill: true,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.5,
        victimPlayerId: "bot2",
      };

      // Set green player close to winning
      mockGameState.board.green[2].isHome = true;
      mockGameState.board.green[3].isHome = true;

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 6, {
        kings: 4,
      });
      expect(score).toBeGreaterThan(1200); // Base kill bonus
    });

    it("should score safety moves positively", () => {
      const move = {
        pieceIndex: 1,
        toPosition: 6, // Safe position (p6)
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: true,
        createsOwnBlock: false,
        progressNormalized: 0.3,
      };

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 5, {
        kings: 4,
      });
      expect(score).toBeGreaterThan(400); // Safety bonus
    });

    it("should score blocking moves positively", () => {
      const move = {
        pieceIndex: 1,
        toPosition: 6,
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: true,
        progressNormalized: 0.3,
      };

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 5, {
        kings: 4,
      });
      expect(score).toBeGreaterThan(250); // Block bonus
    });

    it("should score bringing out on six highly", () => {
      const move = {
        pieceIndex: 3,
        toPosition: 0,
        isBringOut: true,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0,
      };

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 6, {
        kings: 4,
      });
      expect(score).toBeGreaterThan(700); // Bring out bonus
    });

    it("should give extra bonus for bringing out with few kings", () => {
      const move = {
        pieceIndex: 3,
        toPosition: 0,
        isBringOut: true,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0,
      };

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 6, {
        kings: 2,
      });
      expect(score).toBeGreaterThan(850); // Bring out + extra bonus
    });

    it("should penalize risky moves", () => {
      const move = {
        pieceIndex: 1,
        toPosition: 15,
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.3,
      };

      // Mock estimateRiskAfterMove to return high risk
      jest.spyOn(hardAI, "estimateRiskAfterMove").mockReturnValue(0.8);

      const score = hardAI.scoreMove(mockGameState, "bot1", move, 5, {
        kings: 4,
      });
      expect(score).toBeLessThan(0); // High risk penalty

      jest.restoreAllMocks();
    });

    it("should add randomness for tie-breaking", () => {
      const move = {
        pieceIndex: 1,
        toPosition: 15,
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.3,
      };

      const score1 = hardAI.scoreMove(mockGameState, "bot1", move, 5, {
        kings: 4,
      });

      // Change random value
      mockRandomValue = 0.8;
      const score2 = hardAI.scoreMove(mockGameState, "bot1", move, 5, {
        kings: 4,
      });

      expect(score1).not.toBe(score2);
      expect(Math.abs(score1 - score2)).toBeLessThan(10); // Difference should be small
    });

    it("should prioritize finishing over killing when close to win", () => {
      // Set up scenario where red is close to winning
      mockGameState.board.red[0].isHome = true;
      mockGameState.board.red[1].isHome = true;
      mockGameState.board.red[2].position = 55; // One step from home

      const finishMove = {
        pieceIndex: 2,
        toPosition: 56,
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 1,
      };

      const killMove = {
        pieceIndex: 3,
        toPosition: 25,
        isBringOut: false,
        willKill: true,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.4,
        victimPlayerId: "bot2",
      };

      const finishScore = hardAI.scoreMove(
        mockGameState,
        "bot1",
        finishMove,
        1,
        { kings: 4 }
      );
      const killScore = hardAI.scoreMove(mockGameState, "bot1", killMove, 6, {
        kings: 4,
      });

      expect(finishScore).toBeGreaterThan(killScore);
    });

    it("should prioritize killing over safety when opponent is close to winning", () => {
      // Set green player close to winning
      mockGameState.board.green[0].isHome = true;
      mockGameState.board.green[1].isHome = true;
      mockGameState.board.green[2].isHome = true;

      const killMove = {
        pieceIndex: 1,
        toPosition: 25,
        isBringOut: false,
        willKill: true,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.4,
        victimPlayerId: "bot2",
      };

      const safeMove = {
        pieceIndex: 2,
        toPosition: 6, // Safe position
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: true,
        createsOwnBlock: false,
        progressNormalized: 0.1,
      };

      const killScore = hardAI.scoreMove(mockGameState, "bot1", killMove, 6, {
        kings: 4,
      });
      const safeScore = hardAI.scoreMove(mockGameState, "bot1", safeMove, 6, {
        kings: 4,
      });

      expect(killScore).toBeGreaterThan(safeScore);
    });

    it("should balance safety vs progress based on opponent threat", () => {
      // Low threat scenario - prefer progress
      const progressMove = {
        pieceIndex: 1,
        toPosition: 20,
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: false,
        createsOwnBlock: false,
        progressNormalized: 0.4,
      };

      const safeMove = {
        pieceIndex: 2,
        toPosition: 6, // Safe but low progress
        isBringOut: false,
        willKill: false,
        landsOnSafeSquare: true,
        createsOwnBlock: false,
        progressNormalized: 0.1,
      };

      const progressScore = hardAI.scoreMove(
        mockGameState,
        "bot1",
        progressMove,
        5,
        { kings: 4 }
      );
      const safeScore = hardAI.scoreMove(mockGameState, "bot1", safeMove, 5, {
        kings: 4,
      });

      expect(progressScore).toBeGreaterThan(safeScore);
    });
  });

  describe("estimateOpponentThreatLevel", () => {
    it("should return 0 for non-existent opponent", () => {
      const threat = hardAI.estimateOpponentThreatLevel(
        mockGameState,
        "nonexistent",
        { kings: 4 }
      );
      expect(threat).toBe(0);
    });

    it("should calculate threat based on tokens in win zone", () => {
      // Set green player close to winning
      mockGameState.board.green[2].isHome = true;
      mockGameState.board.green[3].isHome = true;

      const threat = hardAI.estimateOpponentThreatLevel(mockGameState, "bot2", {
        kings: 4,
      });
      expect(threat).toBeGreaterThan(0);
      expect(threat).toBeLessThanOrEqual(10);
    });

    it("should cap threat at maximum of 10", () => {
      // Set all green pieces to home
      mockGameState.board.green.forEach((piece) => {
        piece.isHome = true;
      });

      const threat = hardAI.estimateOpponentThreatLevel(mockGameState, "bot2", {
        kings: 4,
      });
      expect(threat).toBe(7); // 4/4 * 7 = 7 (no progress threat when all pieces are home)
    });
  });

  describe("estimateRiskAfterMove", () => {
    it("should return 0 for safe positions", () => {
      const move = {
        toPosition: 6, // Safe position (p6)
      };

      const risk = hardAI.estimateRiskAfterMove(mockGameState, "bot1", move);
      expect(risk).toBe(0);
    });

    it("should return 1 for non-existent player", () => {
      const move = {
        toPosition: 20,
      };

      const risk = hardAI.estimateRiskAfterMove(
        mockGameState,
        "nonexistent",
        move
      );
      expect(risk).toBe(1);
    });

    it("should calculate risk based on opponent proximity", () => {
      const move = {
        toPosition: 20,
      };

      // Place opponent piece close to target
      mockGameState.board.green[1].position = 19;

      const risk = hardAI.estimateRiskAfterMove(mockGameState, "bot1", move);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBeLessThanOrEqual(1);
    });

    it("should calculate high risk when opponent can reach position with multiple dice", () => {
      const move = {
        toPosition: 25,
      };

      // Place opponent pieces at various distances
      mockGameState.board.green[0].position = 20; // Can reach with dice 5
      mockGameState.board.green[1].position = 19; // Can reach with dice 6
      mockGameState.board.green[2].position = 18; // Can reach with dice 7 (invalid)

      const risk = hardAI.estimateRiskAfterMove(mockGameState, "bot1", move);
      expect(risk).toBeGreaterThan(0.5); // High risk due to multiple opponents nearby
    });

    it("should calculate low risk when opponent is far away", () => {
      const move = {
        toPosition: 30,
      };

      // Place opponent piece far away
      mockGameState.board.green[0].position = 10;

      const risk = hardAI.estimateRiskAfterMove(mockGameState, "bot1", move);
      expect(risk).toBeLessThan(0.5); // Lower risk due to distance
    });

    it("should handle multiple opponents correctly", () => {
      const move = {
        toPosition: 25,
      };

      // Multiple opponents at different distances
      mockGameState.board.green[0].position = 20; // Can reach with dice 5
      mockGameState.board.yellow[0].position = 19; // Can reach with dice 6

      const risk = hardAI.estimateRiskAfterMove(mockGameState, "bot1", move);
      expect(risk).toBeGreaterThan(0);
      expect(risk).toBeLessThanOrEqual(1);
    });
  });

  describe("opponentIsOneTokenFromWin", () => {
    it("should return true when opponent is close to winning", () => {
      // Set green player one token away from winning
      mockGameState.board.green[0].isHome = true;
      mockGameState.board.green[1].isHome = true;
      mockGameState.board.green[2].isHome = true;
      // 3 out of 4 kings home

      const result = hardAI.opponentIsOneTokenFromWin(mockGameState, {
        kings: 4,
      });
      expect(result).toBe(true);
    });

    it("should return false when no opponent is close to winning", () => {
      const result = hardAI.opponentIsOneTokenFromWin(mockGameState, {
        kings: 4,
      });
      expect(result).toBe(false);
    });

    it("should work with custom king count", () => {
      // Set green player one token away from winning with 2 kings
      mockGameState.board.green[0].isHome = true;
      // 1 out of 2 kings home

      const result = hardAI.opponentIsOneTokenFromWin(mockGameState, {
        kings: 2,
      });
      expect(result).toBe(true);
    });
  });

  describe("utility methods", () => {
    it("should identify win zone positions", () => {
      expect(hardAI.isInWinZone(50, "red")).toBe(true);
      expect(hardAI.isInWinZone(49, "red")).toBe(false);
      expect(hardAI.isInWinZone(56, "red")).toBe(true);
    });

    it("should return correct starting positions", () => {
      expect(hardAI.getStartingPosition("red")).toBe(0);
      expect(hardAI.getStartingPosition("green")).toBe(13);
      expect(hardAI.getStartingPosition("yellow")).toBe(26);
      expect(hardAI.getStartingPosition("blue")).toBe(39);
      expect(hardAI.getStartingPosition("unknown")).toBe(0);
    });

    it("should calculate next positions correctly", () => {
      expect(hardAI.getNextPosition(10, 5, "red")).toBe(15);
      expect(hardAI.getNextPosition(-1, 6, "red")).toBe(null);
      expect(hardAI.getNextPosition(55, 6, "red")).toBe(null); // Would exceed home
    });

    it("should detect killing moves", () => {
      expect(hardAI.wouldKillOpponent(mockGameState, 20, "red")).toBe(true); // Green piece at 20
      expect(hardAI.wouldKillOpponent(mockGameState, 15, "red")).toBe(false); // No piece at 15
    });

    it("should get player at position", () => {
      expect(hardAI.getPlayerAtPosition(mockGameState, 20)).toBe("bot2"); // Green piece
      expect(hardAI.getPlayerAtPosition(mockGameState, 15)).toBe(null); // No piece
    });

    it("should detect own blocks", () => {
      // Place two red pieces on same position
      mockGameState.board.red[0].position = 15;
      mockGameState.board.red[1].position = 15;

      expect(hardAI.createsOwnBlock(mockGameState, 15, "red")).toBe(true);
      expect(hardAI.createsOwnBlock(mockGameState, 20, "red")).toBe(false);
    });

    it("should calculate progress correctly", () => {
      expect(hardAI.calculateProgress(0, 10, "red")).toBe(10 / 56);
      expect(hardAI.calculateProgress(-1, 0, "red")).toBe(0);
      expect(hardAI.calculateProgress(50, 56, "red")).toBe(6 / 56);
    });
  });

  describe("integration scenarios", () => {
    it("should prioritize finishing over killing when close to win", () => {
      // Set red player very close to winning
      mockGameState.board.red[0].isHome = true;
      mockGameState.board.red[1].isHome = true;
      mockGameState.board.red[2].position = 55; // One step from home

      // Place vulnerable opponent piece
      mockGameState.board.green[1].position = 25;

      const result = hardAI.chooseMove(mockGameState, "bot1", 1);

      expect(result.pieceIndex).toBe(2); // Should move piece closer to home
      expect(result.toPosition).toBe(56); // Should go to home
    });

    it("should prefer safe moves over risky ones when opponent is close to winning", () => {
      // Set green player close to winning
      mockGameState.board.green[0].isHome = true;
      mockGameState.board.green[1].isHome = true;
      mockGameState.board.green[2].isHome = true;

      // Create two options: risky but high progress, safe but low progress
      mockGameState.board.red[1].position = 19; // Can move to 25 (risky)
      mockGameState.board.red[2].position = 44; // Can move to 50 (safe)

      const result = hardAI.chooseMove(mockGameState, "bot1", 6);

      // Should prefer the safer move when opponent is close to winning
      expect(result.pieceIndex).toBe(2);
      expect(result.toPosition).toBe(50);
    });

    it("should balance aggression and defense based on king count", () => {
      // Test with 2 kings - should be more aggressive
      const result2Kings = hardAI.chooseMove(mockGameState, "bot1", 6, {
        kings: 2,
      });

      // Test with 4 kings - should be more balanced
      const result4Kings = hardAI.chooseMove(mockGameState, "bot1", 6, {
        kings: 4,
      });

      // Both should return valid moves
      expect(result2Kings).toBeDefined();
      expect(result4Kings).toBeDefined();

      // With fewer kings, bringing out should get higher score
      if (result2Kings.isBringOut && result4Kings.isBringOut) {
        const score2Kings = hardAI.scoreMove(
          mockGameState,
          "bot1",
          result2Kings,
          6,
          { kings: 2 }
        );
        const score4Kings = hardAI.scoreMove(
          mockGameState,
          "bot1",
          result4Kings,
          6,
          { kings: 4 }
        );
        expect(score2Kings).toBeGreaterThan(score4Kings);
      }
    });
  });
});
