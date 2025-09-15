const User = require("../model/User.js");
const GameHistory = require("../model/GameHistory.js");
const Transaction = require("../model/Transaction.js");

/**
 * Update user statistics when a game ends
 * @param {string} userId - The user ID to update stats for
 * @param {boolean} isWinner - Whether the user won the game
 * @param {number} stake - The stake amount for the game
 * @param {number} winnings - The winnings amount (if any)
 * @param {number} gameType - The game type (requiredPieces: 1, 2, 3, or 4)
 */
async function updateUserStats(
  userId,
  isWinner,
  stake,
  winnings = 0,
  gameType
) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User ${userId} not found for stats update`);
      return;
    }

    // Get all games for this user to recalculate stats
    const userGames = await GameHistory.find({
      $or: [{ user: userId }, { "players.userId": userId.toString() }],
    });

    // Get all game winnings transactions
    const winningsTransactions = await Transaction.find({
      user: userId,
      type: "GAME_WINNINGS",
      status: "COMPLETED",
    });

    // Calculate statistics
    const totalGames = userGames.length;
    const gamesWon = userGames.filter(
      (game) =>
        game.winnerId === userId.toString() && game.status === "finished"
    ).length;

    const winRate =
      totalGames > 0
        ? parseFloat(((gamesWon / totalGames) * 100).toFixed(1))
        : 0.0;
    const totalWinnings = winningsTransactions.reduce(
      (sum, tx) => sum + (tx.amount || 0),
      0
    );
    const totalStakes = userGames.reduce(
      (sum, game) => sum + (game.stake || 0),
      0
    );
    const netProfit = totalWinnings - totalStakes;

    // Calculate game type distribution
    const gamesByType = { 1: 0, 2: 0, 3: 0, 4: 0 };
    userGames.forEach((game) => {
      if (
        game.requiredPieces &&
        gamesByType[game.requiredPieces] !== undefined
      ) {
        gamesByType[game.requiredPieces]++;
      }
    });

    // Get last game played and last game won
    const lastGamePlayed =
      userGames.length > 0
        ? new Date(Math.max(...userGames.map((g) => g.createdAt)))
        : null;

    const wonGames = userGames.filter(
      (game) =>
        game.winnerId === userId.toString() && game.status === "finished"
    );
    const lastGameWon =
      wonGames.length > 0
        ? new Date(Math.max(...wonGames.map((g) => g.createdAt)))
        : null;

    // Update user with new statistics
    await User.findByIdAndUpdate(userId, {
      totalGames,
      gamesWon,
      winRate,
      totalWinnings,
      totalStakes,
      netProfit,
      gamesByType,
      lastGamePlayed,
      lastGameWon,
      updatedAt: new Date(),
    });

    console.log(
      `Updated stats for user ${userId}: Games: ${totalGames}, Won: ${gamesWon}, Win Rate: ${winRate}%`
    );
  } catch (error) {
    console.error(`Error updating stats for user ${userId}:`, error);
  }
}

/**
 * Recalculate statistics for all users (useful for maintenance)
 */
async function recalculateAllUserStats() {
  try {
    console.log("Starting recalculation of all user statistics...");

    const users = await User.find({});
    let updatedCount = 0;

    for (const user of users) {
      try {
        await updateUserStats(user._id, false, 0, 0, 1);
        updatedCount++;
      } catch (error) {
        console.error(`Error updating stats for user ${user._id}:`, error);
      }
    }

    console.log(`Successfully updated statistics for ${updatedCount} users`);
  } catch (error) {
    console.error("Error in bulk stats recalculation:", error);
  }
}

module.exports = {
  updateUserStats,
  recalculateAllUserStats,
};
