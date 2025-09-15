const GameHistory = require("../model/GameHistory");
const User = require("../model/User");
const GameRoom = require("../model/GameRoom");

// Get all games
const getAllGames = async (req, res) => {
  try {
    const games = await GameHistory.find()
      .populate({
        path: "user",
        select: "id username",
      })
      .populate("room")
      .sort({ createdAt: -1 });
    res.status(200).json(games);
  } catch (error) {
    console.error("Error fetching games:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get game history for a specific user
const getGameHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`[GameHistory] Fetching history for user: ${userId}`);

    // Fetch game history for the authenticated user
    // Look for games where user is either the primary user OR participated as a player
    const query = {
      $or: [
        { user: userId }, // Games where user is the primary record
        { "players.userId": userId }, // Games where user is in players array
        { "players.id": userId }, // Games where user is in players array with id (fallback)
      ],
    };

    console.log(`[GameHistory] Query:`, JSON.stringify(query, null, 2));

    const games = await GameHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 games for performance

    console.log(`[GameHistory] Found ${games.length} games`);

    // Log first few games for debugging
    if (games.length > 0) {
      console.log(`[GameHistory] First game sample:`, {
        _id: games[0]._id,
        user: games[0].user,
        players: games[0].players?.map((p) => ({
          userId: p.userId,
          id: p.id,
          name: p.name,
        })),
        winnerId: games[0].winnerId,
        createdAt: games[0].createdAt,
      });
    } else {
      console.log(`[GameHistory] No games found for user ${userId}`);
      console.log(`[GameHistory] Query used:`, JSON.stringify(query, null, 2));

      // Let's also check if there are any games in the database at all
      const totalGames = await GameHistory.countDocuments();
      console.log(`[GameHistory] Total games in database: ${totalGames}`);

      if (totalGames > 0) {
        const sampleGame = await GameHistory.findOne();
        console.log(`[GameHistory] Sample game from database:`, {
          _id: sampleGame._id,
          user: sampleGame.user,
          players: sampleGame.players,
          winnerId: sampleGame.winnerId,
        });
      }
    }

    // No transformation needed - updatedAt field is now in the schema
    const transformedGames = games.map((game) => game.toObject());

    res.status(200).json({
      success: true,
      games: transformedGames,
      total: games.length,
    });
  } catch (error) {
    console.error("Error fetching user game history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch game history",
    });
  }
};

const gameController = {
  getAllGames,
  getGameHistory,
};

module.exports = gameController;
