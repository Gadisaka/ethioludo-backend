const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../model/User");

// Connect to MongoDB
const connectDB = async () => {
  try {
    // Try multiple database URIs to find the correct one
    const possibleUris = [process.env.MONGO_URI].filter(Boolean);

    let connected = false;
    for (const uri of possibleUris) {
      try {
        console.log(`🔌 Attempting to connect to: ${uri}`);
        await mongoose.connect(uri);
        console.log(`✅ Connected to MongoDB successfully`);
        connected = true;
        break;
      } catch (error) {
        console.log(`❌ Failed to connect to ${uri}:`, error.message);
      }
    }

    if (!connected) {
      throw new Error("Could not connect to any MongoDB instance");
    }
  } catch (error) {
    console.error("❌ Database connection error:", error);
    process.exit(1);
  }
};

const seedAdmin = async () => {
  try {
    await connectDB();

    console.log("🗑️ Checking for existing admin user...");

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "ADMIN" });
    if (existingAdmin) {
      console.log("✅ Admin user already exists:", {
        phone: existingAdmin.phone,
        username: existingAdmin.username,
        role: existingAdmin.role,
      });
      return existingAdmin;
    }

    console.log("📝 Creating admin user...");

    // Create admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);

    const adminUser = new User({
      phone: "0911111111",
      username: "admin",
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
    });

    await adminUser.save();

    console.log("✅ Admin user created successfully:", {
      phone: adminUser.phone,
      username: adminUser.username,
      role: adminUser.role,
      id: adminUser._id,
    });

    return adminUser;
  } catch (error) {
    console.error("❌ Error seeding admin user:", error);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

// If this file is run directly, execute the seed function
if (require.main === module) {
  seedAdmin()
    .then(() => {
      console.log("🎉 Admin seeding completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Admin seeding failed:", error);
      process.exit(1);
    });
}

module.exports = seedAdmin;
