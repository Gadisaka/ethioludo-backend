const mongoose = require("mongoose");

const GameStatus = {
  waiting: "waiting",
  playing: "playing",
  finished: "finished",
};

const DieStatus = {
  stopped: "stopped",
  rolling: "rolling",
};

const gameRoomSchema = new mongoose.Schema({
  roomId: { type: String, unique: true, required: true },
  players: { type: mongoose.Schema.Types.Mixed, required: true },
  currentTurn: { type: String, required: true },
  gameStatus: { type: String, enum: Object.values(GameStatus), required: true },
  dieStatus: { type: String, enum: Object.values(DieStatus), required: true },
  lastRoll: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  hostId: { type: String, required: true },
  host: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  gameSettings: { type: mongoose.Schema.Types.Mixed, required: true },
  gameState: { type: mongoose.Schema.Types.ObjectId, ref: "GameState" },
  // Bot decision made at game creation time
  botsEnabled: { type: Boolean, default: false },
});

module.exports = mongoose.model("GameRoom", gameRoomSchema);
