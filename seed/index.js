const mongoose = require("mongoose");
const { seedAdmins } = require("./admin");
const { seedBanks } = require("./banks");
require("dotenv").config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    console.log("🔌 Attempting to connect to MongoDB...");
    console.log("🔌 MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not Set");
    console.log("🔌 MONGODB_URI:", process.env.MONGODB_URI ? "Set" : "Not Set");

    const uri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/ludo-king";

    await mongoose.connect(uri, {
      // MongoDB connection options
    });

    console.log("✅ Connected to MongoDB successfully");
    console.log("✅ Database:", mongoose.connection.db.databaseName);
  } catch (error) {
    console.error("❌ Database connection error:", error);
    process.exit(1);
  }
};

// Main seed function
const seedAll = async () => {
  try {
    await connectDB();

    console.log("🌱 Starting database seeding...");

    // Seed admins
    console.log("\n📝 Seeding admin users...");
    await seedAdmins();

    // Seed banks
    console.log("\n📝 Seeding banks...");
    await seedBanks();

    console.log("\n🎉 All seeding completed successfully!");
  } catch (error) {
    console.error("💥 Seeding failed:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// If this file is run directly, execute the seed function
if (require.main === module) {
  seedAll()
    .then(() => {
      console.log("🎉 Database seeding completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Database seeding failed:", error);
      process.exit(1);
    });
}

module.exports = { seedAll, seedAdmins, seedBanks };
