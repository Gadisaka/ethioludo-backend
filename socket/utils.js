const { paths } = require("../constants");

function hasPlayerWon(pieces, color, requiredPieces) {
  const piecesInWinZone = pieces[color].filter(
    (piece) => piece === `${color}WinZone`
  ).length;
  return piecesInWinZone >= requiredPieces;
}

function getNextPosition(piece, rollValue, color) {
  if (!piece) {
    return null;
  }
  if (piece.startsWith(`${color[0]}h`)) {
    if (rollValue === 6) {
      switch (color) {
        case "red":
          return "p38";
        case "green":
          return "p6";
        case "blue":
          return "p67";
        case "yellow":
          return "p24";
      }
    } else {
      return null;
    }
  }
  const lastSixPositions = paths[color].slice(-6);
  const isInLastSix = lastSixPositions.includes(piece);

  console.log(
    `getNextPosition: piece=${piece}, color=${color}, rollValue=${rollValue}`
  );
  console.log(`lastSixPositions:`, lastSixPositions);
  console.log(`isInLastSix: ${isInLastSix}`);
  console.log(
    `Piece position in lastSixPositions:`,
    lastSixPositions.indexOf(piece)
  );
  console.log(`Full path for ${color}:`, paths[color]);

  if (isInLastSix) {
    const remainingPositions =
      lastSixPositions.length - lastSixPositions.indexOf(piece);
    console.log(
      `Piece ${piece} in final stretch: rollValue=${rollValue}, remaining=${remainingPositions}`
    );

    // Explicitly handle Roll 6, Remaining 6 case
    if (rollValue === 6 && remainingPositions === 6) {
      console.log(`EXPLICIT: Roll 6, Remaining 6 - Moving to WinZone!`);
      return `${color}WinZone`;
    }

    // Handle exact matches to win zone
    if (rollValue === remainingPositions) {
      console.log(
        `Roll ${rollValue} === remaining ${remainingPositions}, moving to WinZone`
      );
      return `${color}WinZone`;
    }

    // Handle cases where roll value is less than remaining positions
    if (rollValue < remainingPositions) {
      const finalStretchIndex = lastSixPositions.indexOf(piece);
      const newFinalStretchIndex = finalStretchIndex + rollValue;
      if (newFinalStretchIndex < lastSixPositions.length) {
        console.log(
          `Moving within final stretch to position ${lastSixPositions[newFinalStretchIndex]}`
        );
        return lastSixPositions[newFinalStretchIndex];
      }
    }

    // If roll value is greater than remaining positions, cannot move
    if (rollValue > remainingPositions) {
      console.log(
        `Roll ${rollValue} > remaining ${remainingPositions}, cannot move`
      );
      return null;
    }

    // If we reach here, something went wrong
    console.log(
      `Unexpected case: rollValue=${rollValue}, remainingPositions=${remainingPositions}`
    );
    return null;
  }

  // Only calculate normal path positions if NOT in final stretch
  console.log(`Piece NOT in final stretch, using normal path logic`);
  const currentPositionIndex = paths[color].findIndex((pos) => pos === piece);
  const nextPositionIndex = currentPositionIndex + rollValue;
  console.log(
    `currentPositionIndex: ${currentPositionIndex}, nextPositionIndex: ${nextPositionIndex}, path.length: ${paths[color].length}`
  );
  if (nextPositionIndex >= paths[color].length) {
    console.log(
      `nextPositionIndex ${nextPositionIndex} >= path.length ${paths[color].length}, returning null`
    );
    return null;
  }
  const nextPosition = paths[color][nextPositionIndex];
  console.log(`Moving to normal path position: ${nextPosition}`);
  return nextPosition.toString();
}

function isSafePosition(position) {
  return (
    position === "p6" ||
    position === "p25" ||
    position === "p66" ||
    position === "p67" ||
    position === "p51" ||
    position === "p38" ||
    position === "p7" ||
    position === "p24"
  );
}

function getMovableTokens(pieces, color, rollValue) {
  const tokens = pieces[color] || [];
  const path = paths[color];
  if (!path) return [];
  let movable = [];
  tokens.forEach((pos, idx) => {
    // Home positions start with color initial + 'h'
    const isHome = pos.startsWith(`${color[0]}h`);
    if (isHome) {
      if (rollValue === 6) movable.push(idx);
      return;
    }
    // If in win zone, skip
    if (pos === `${color}WinZone`) return;
    // Find current index in path
    const pathIdx = path.indexOf(pos);
    if (pathIdx === -1) return;

    // Check if piece is in final stretch (last 6 positions)
    const lastSixPositions = path.slice(-6);
    const isInLastSix = lastSixPositions.includes(pos);

    if (isInLastSix) {
      // Piece is in final stretch - check if it can reach win zone
      const remainingPositions =
        lastSixPositions.length - lastSixPositions.indexOf(pos);
      if (rollValue <= remainingPositions) {
        movable.push(idx);
        console.log(
          `Piece ${idx} can move to win zone: roll=${rollValue}, remaining=${remainingPositions}`
        );
      }
    } else {
      // Piece is in normal path - check if move stays within bounds
      if (pathIdx + rollValue < path.length) {
        movable.push(idx);
      }
    }
  });
  return movable;
}

// Final safety check for Roll 6, Remaining 6
function getNextPositionWithFallback(piece, rollValue, color) {
  console.log(
    `=== FALLBACK CHECK: piece=${piece}, rollValue=${rollValue}, color=${color} ===`
  );

  // Try the main function first
  const result = getNextPosition(piece, rollValue, color);
  if (result) {
    console.log(`Main function returned: ${result}`);
    return result;
  }

  // If main function failed, try explicit Roll 6, Remaining 6 logic
  if (rollValue === 6) {
    const lastSixPositions = paths[color].slice(-6);
    const isInLastSix = lastSixPositions.includes(piece);

    if (isInLastSix) {
      const remainingPositions =
        lastSixPositions.length - lastSixPositions.indexOf(piece);
      console.log(`FALLBACK: Roll 6, remaining=${remainingPositions}`);

      if (remainingPositions === 6) {
        console.log(
          `FALLBACK SUCCESS: Roll 6, Remaining 6 - Moving to WinZone!`
        );
        return `${color}WinZone`;
      }
    }
  }

  console.log(`FALLBACK: All attempts failed, returning null`);
  return null;
}

module.exports = {
  hasPlayerWon,
  getNextPosition,
  getNextPositionWithFallback,
  isSafePosition,
  getMovableTokens,
};
