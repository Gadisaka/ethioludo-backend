const mongoose = require("mongoose");

const GameStatus = {
  waiting: "waiting",
  playing: "playing",
  finished: "finished",
};

const gameHistorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  roomId: { type: String, required: true },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GameRoom",
  },
  winnerId: { type: String },
  stake: { type: Number, required: true },
  requiredPieces: { type: Number, required: true },
  players: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: Object.values(GameStatus), required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Pre-save middleware to update the updatedAt field
gameHistorySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("GameHistory", gameHistorySchema);
