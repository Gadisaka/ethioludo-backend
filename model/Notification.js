const mongoose = require("mongoose");

const NotificationType = {
  INFO: "INFO",
  SUCCESS: "SUCCESS",
  WARNING: "WARNING",
  ERROR: "ERROR",
};

const NotificationStatus = {
  UNREAD: "UNREAD",
  READ: "READ",
};

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: Object.values(NotificationType),
    default: NotificationType.INFO,
  },
  status: {
    type: String,
    enum: Object.values(NotificationStatus),
    default: NotificationStatus.UNREAD,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

notificationSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Notification", notificationSchema);
