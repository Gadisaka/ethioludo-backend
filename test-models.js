const mongoose = require("mongoose");
require("dotenv").config();

async function testModels() {
  console.log("Testing model imports and database connection...\n");

  try {
    // Test 1: Check environment variables
    console.log("1. Environment variables:");
    console.log("   MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not Set");
    console.log("   JWT_SECRET:", process.env.JWT_SECRET ? "Set" : "Not Set");

    // Test 2: Test model imports
    console.log("\n2. Testing model imports:");
    try {
      const User = require("./model/User.js");
      const GameHistory = require("./model/GameHistory.js");
      const Transaction = require("./model/Transaction.js");
      console.log("   ✅ All models imported successfully");
    } catch (error) {
      console.log("   ❌ Model import error:", error.message);
      return;
    }

    // Test 3: Test database connection
    console.log("\n3. Testing database connection:");
    try {
      console.log("   Attempting to connect to MongoDB...");
      await mongoose.connect(process.env.MONGO_URI);
      console.log("   ✅ Connected to MongoDB successfully");
      console.log("   Database:", mongoose.connection.db.databaseName);

      // Test 4: Test basic database operations
      console.log("\n4. Testing basic database operations:");

      // Test User model
      const userCount = await mongoose.model("User").countDocuments();
      console.log("   Users count:", userCount);

      // Test GameHistory model
      const gameCount = await mongoose.model("GameHistory").countDocuments();
      console.log("   Games count:", gameCount);

      // Test Transaction model
      const transactionCount = await mongoose
        .model("Transaction")
        .countDocuments();
      console.log("   Transactions count:", transactionCount);

      console.log(
        "\n✅ All tests passed! Database connection and models are working correctly."
      );
    } catch (error) {
      console.log("   ❌ Database connection error:", error.message);
      console.log("   Full error:", error);
    } finally {
      // Close the connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log("   Database connection closed.");
      }
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }
}

// Run the tests
testModels();
