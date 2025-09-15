# Hard AI Implementation (GladiatorAI)

## Overview

The `GladiatorAI` class (also exported as `HardAI` for backward compatibility) implements a sophisticated scoring heuristic for Ludo bot players. It evaluates all possible moves and selects the optimal one based on multiple strategic factors.

## Class Structure

- **Primary Class**: `GladiatorAI` - The main implementation
- **Backward Compatibility**: `HardAI` - Extends `GladiatorAI` for existing code compatibility

## Core Functionality

### Main Method: `chooseMove(gameState, playerId, dice, rules)`

- **Parameters:**

  - `gameState`: Current game state with board and players
  - `playerId`: ID of the bot player making the move
  - `dice`: Dice roll value (1-6)
  - `rules`: Optional game rules object (defaults to 4 kings)

- **Returns:** Best move object or `null` if no moves available

## Scoring Heuristic

The AI uses a comprehensive scoring system that prioritizes moves in the following order:

### 1. Immediate Win Progress (5000+ points)

- **Huge bonus (5000 points)** for moves that complete the game
- **Partial progress (800 points per token)** for moves that bring tokens into the win zone
- Win zone is defined as positions 50+ (configurable)

### 2. Killing Opponents (1200+ points)

- **Base kill bonus (1200 points)** for capturing opponent pieces
- **Additional bonus (100 × threat level)** based on how close the opponent is to winning
- Threat level ranges from 0-10, calculated from tokens in win zone and progress

### 3. Safety and Protection (400-650 points)

- **Safe square bonus (400 points)** for landing on positions that cannot be captured
- **Blocking bonus (250 points)** for creating stacks with own pieces
- **Enhanced blocking (400 points)** when opponents are close to winning

### 4. Strategic Development (700+ points)

- **Bring out bonus (700 points)** for introducing pieces on a roll of 6
- **Extra bonus (150 points)** for bringing out when playing with 2 or fewer kings
- **Progress bonus (350 × normalized progress)** for forward movement

### 5. Risk Assessment (-1000 points max penalty)

- **Risk penalty** based on probability of being captured next turn
- Considers opponent proximity and ability to reach the target position
- Safe positions have zero risk

### 6. Opponent Threat Response (600+ points)

- **Enhanced killing (600 points)** when opponents are one token from winning
- **Enhanced blocking (400 points)** when opponents are close to winning

### 7. Tie-breaking (0-10 points)

- **Randomness factor** to break ties between equally scored moves

## King-Aware Strategy

The AI adapts its strategy based on the number of kings required to win:

- **Few kings (1-2)**: More aggressive, prioritizes bringing out pieces early
- **Many kings (3-4)**: Balanced approach, values safety and blocking more

## Usage Examples

### Basic Usage

```javascript
// Using the new GladiatorAI class
const { GladiatorAI } = require("./hard");
const gladiatorAI = new GladiatorAI();
const bestMove = gladiatorAI.chooseMove(gameState, "bot1", 6);

// Or using the backward-compatible HardAI class
const { HardAI } = require("./hard");
const hardAI = new HardAI();
const bestMove = hardAI.chooseMove(gameState, "bot1", 6);
```

### Custom Rules

```javascript
const customRules = { kings: 2 };
const bestMove = hardAI.chooseMove(gameState, "bot1", 6, customRules);
```

### Move Object Structure

```javascript
{
  pieceIndex: 2,           // Index of piece to move
  fromPosition: 45,        // Current position
  toPosition: 50,          // Target position
  isBringOut: false,       // Whether this brings out a piece
  willKill: false,         // Whether this kills an opponent
  landsOnSafeSquare: true, // Whether landing position is safe
  createsOwnBlock: false,  // Whether this creates a block
  progressNormalized: 0.3, // Normalized progress (0-1)
  victimPlayerId: null,    // ID of killed player (if any)
  score: 1250.5           // Calculated score (added after scoring)
}
```

## Integration with Bot Controller

The GladiatorAI is designed to work seamlessly with the `BotController`:

1. **Move Selection**: `BotController` calls `gladiatorAI.chooseMove()` to get the best move
2. **Move Execution**: Selected move is executed using existing game logic
3. **Event Emission**: All bot actions are logged via `botAction` events

## Compatibility Features

The implementation includes several compatibility features:

- **Dual Export**: Both `GladiatorAI` and `HardAI` are exported for backward compatibility
- **Data Format Support**: Handles both old (numeric positions) and new (string positions) game state formats
- **Method Compatibility**: All existing method signatures are preserved
- **Test Compatibility**: Works with existing test suites

## Testing

Comprehensive tests cover:

- **Move Selection**: Prioritizing different types of moves
- **Scoring**: All scoring components and edge cases
- **Integration**: Real-world scenarios with multiple competing moves
- **Edge Cases**: No moves available, invalid states, etc.

## Configuration

### Safe Positions

Safe positions are defined in `utils.js` and include:

- `p6`, `p25`, `p66`, `p67`, `p51`, `p38`, `p7`, `p24`

### Win Zone

Win zone starts at position 50 (configurable in `isInWinZone` method)

### Board Layout

- Red starting position: 0
- Green starting position: 13
- Yellow starting position: 26
- Blue starting position: 39
- Home position: 56

## Performance Considerations

- **Move Generation**: Generates all legal moves for evaluation
- **Scoring**: Each move is scored individually (typically 1-4 moves per turn)
- **Sorting**: Moves are sorted by score to find the best option
- **Caching**: No caching implemented; recalculates for each turn

## Future Enhancements

Potential improvements could include:

- **Move Tree Analysis**: Looking ahead multiple moves
- **Opponent Modeling**: Learning from opponent behavior patterns
- **Position Evaluation**: More sophisticated board state analysis
- **Opening Book**: Pre-computed optimal moves for common early-game positions
- **Machine Learning**: Training on game outcomes to improve scoring weights
