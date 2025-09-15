const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    console.log("🔌 Attempting to connect to MongoDB...");
    console.log("🔌 MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not Set");

    await mongoose.connect(process.env.MONGO_URI, {
      //   useNewUrlParser: true,
      //   useUnifiedTopology: true,
    });
    console.log("✅ Connected to MongoDB Atlas");
    console.log("✅ Database:", mongoose.connection.db.databaseName);
    console.log(
      "✅ Collections:",
      Object.keys(mongoose.connection.collections)
    );
  } catch (err) {
    console.error("❌ Failed to connect:", err.message);
    console.error("❌ Full error:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
