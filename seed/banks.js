const Bank = require("../model/Bank");
const mongoose = require("mongoose");
require("dotenv").config();

const banksData = [
  {
    number: "0911111111",
    bankName: "TeleBirr",
    accountFullName: "Ludo King Admin - TeleBirr",
  },
  {
    number: "1000123456789",
    bankName: "CBE",
    accountFullName: "Ludo King Admin - Commercial Bank of Ethiopia",
  },
];

const seedBanks = async () => {
  try {
    console.log("🗑️ Clearing existing banks...");
    const deleteResult = await Bank.deleteMany({});
    console.log(`✅ Cleared ${deleteResult.deletedCount} existing banks`);

    console.log("📝 Inserting new banks...");
    console.log("Banks to insert:", banksData);

    // Insert new banks
    const banks = await Bank.insertMany(banksData);
    console.log(`✅ Seeded ${banks.length} banks successfully`);

    // Verify the banks were inserted
    const verifyBanks = await Bank.find({});
    console.log(
      "🔍 Verification - Total banks in database:",
      verifyBanks.length
    );
    console.log(
      "🔍 Banks in database:",
      verifyBanks.map((b) => ({ name: b.bankName, number: b.number }))
    );

    return banks;
  } catch (error) {
    console.error("❌ Error seeding banks:", error);
    throw error;
  }
};

// If this file is run directly, execute the seed function
if (require.main === module) {
  const connectDB = async () => {
    try {
      console.log("🔌 Attempting to connect to MongoDB...");
      console.log("🔌 MONGO_URI:", process.env.MONGO_URI ? "Set" : "Not Set");
      console.log(
        "🔌 MONGODB_URI:",
        process.env.MONGODB_URI ? "Set" : "Not Set"
      );

      const mongoUri =
        process.env.MONGO_URI ||
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017/ludo-king";

      await mongoose.connect(mongoUri, {
        // MongoDB connection options
      });

      console.log("✅ Connected to MongoDB");
      console.log("✅ Database:", mongoose.connection.db.databaseName);
      return true;
    } catch (err) {
      console.error("❌ Failed to connect:", err.message);
      throw err;
    }
  };

  connectDB()
    .then(() => {
      return seedBanks();
    })
    .then(() => {
      console.log("Bank seeding completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Bank seeding failed:", error);
      process.exit(1);
    });
}

module.exports = { seedBanks, banksData };
