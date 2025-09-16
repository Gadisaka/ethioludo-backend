const User = require("../model/User");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const adminData = [
  {
    phone: "0912121212",
    username: "admin",
    password: "0912121212", // Will be hashed before saving
    role: "ADMIN",
    isActive: true,
  },
  {
    phone: "0922222222",
    username: "admin2",
    password: "0922222222", // Will be hashed before saving
    role: "ADMIN",
    isActive: true,
  },
];

const seedAdmins = async () => {
  try {
    console.log("🗑️ Clearing existing admin users...");
    const deleteResult = await User.deleteMany({ role: "ADMIN" });
    console.log(`✅ Cleared ${deleteResult.deletedCount} existing admin users`);

    console.log("📝 Creating admin users...");

    // Hash passwords and create admin users
    const adminUsers = [];
    for (const admin of adminData) {
      const hashedPassword = await bcrypt.hash(admin.password, 10);
      const adminUser = new User({
        phone: admin.phone,
        username: admin.username,
        password: hashedPassword,
        role: admin.role,
        isActive: admin.isActive,
      });
      adminUsers.push(adminUser);
    }

    // Insert new admin users
    const savedAdmins = await User.insertMany(adminUsers);
    console.log(`✅ Seeded ${savedAdmins.length} admin users successfully`);

    // Verify the admins were inserted
    const verifyAdmins = await User.find({ role: "ADMIN" });
    console.log(
      "🔍 Verification - Total admin users in database:",
      verifyAdmins.length
    );
    console.log(
      "🔍 Admin users in database:",
      verifyAdmins.map((admin) => ({
        username: admin.username,
        phone: admin.phone,
        role: admin.role,
        isActive: admin.isActive,
      }))
    );

    return savedAdmins;
  } catch (error) {
    console.error("❌ Error seeding admin users:", error);
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
      return seedAdmins();
    })
    .then(() => {
      console.log("Admin seeding completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Admin seeding failed:", error);
      process.exit(1);
    });
}

module.exports = { seedAdmins, adminData };
