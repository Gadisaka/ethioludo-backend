const User = require("../model/User");
const mongoose = require("mongoose");
require("dotenv").config();

const addAdminEmails = async () => {
  try {
    console.log("🔍 Finding admin users without emails...");

    // Find admin users without email
    const adminsWithoutEmail = await User.find({
      role: "ADMIN",
      $or: [{ email: { $exists: false } }, { email: null }, { email: "" }],
    });

    console.log(
      `📊 Found ${adminsWithoutEmail.length} admin users without emails`
    );

    if (adminsWithoutEmail.length === 0) {
      console.log("✅ All admin users already have emails");
      return;
    }

    // Generate random emails for each admin
    const updates = adminsWithoutEmail.map((admin, index) => {
      const randomEmail = `admin${index + 1}@ludoking.ethio.com`;
      return {
        updateOne: {
          filter: { _id: admin._id },
          update: { email: randomEmail },
        },
      };
    });

    // Bulk update admin users with emails
    const result = await User.bulkWrite(updates);
    console.log(`✅ Updated ${result.modifiedCount} admin users with emails`);

    // Verify the updates
    const updatedAdmins = await User.find({ role: "ADMIN" }).select(
      "username phone email"
    );
    console.log("🔍 Updated admin users:");
    updatedAdmins.forEach((admin) => {
      console.log(
        `  - ${admin.username} (${admin.phone}): ${admin.email || "No email"}`
      );
    });

    return result;
  } catch (error) {
    console.error("❌ Error adding admin emails:", error);
    throw error;
  }
};

// If this file is run directly, execute the function
if (require.main === module) {
  const connectDB = async () => {
    try {
      console.log("🔌 Attempting to connect to MongoDB...");

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
      return addAdminEmails();
    })
    .then(() => {
      console.log("✅ Admin email addition completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Admin email addition failed:", error);
      process.exit(1);
    });
}

module.exports = { addAdminEmails };
