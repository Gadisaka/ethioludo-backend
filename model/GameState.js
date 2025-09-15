const mongoose = require("mongoose");

const gameStateSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, required: true },
  pieces: { type: mongoose.Schema.Types.Mixed, required: true },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GameRoom",
    required: true,
  },
});

module.exports = mongoose.model("GameState", gameStateSchema);
