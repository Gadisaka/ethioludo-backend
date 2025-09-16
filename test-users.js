const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./model/User");

const connectDB = async () => {
  try {
    // Try multiple database URIs to find the correct one
    const possibleUris = [
      process.env.MONGO_URI,
      process.env.MONGODB_URI,
      "mongodb://localhost:27017/ludo-king",
      "mongodb://localhost:27017/ludo-game",
      "mongodb://localhost:27017/ludo",
    ].filter(Boolean);

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

const checkUsers = async () => {
  try {
    await connectDB();

    console.log("👥 Checking all users...");
    const users = await User.find({}).select("phone username role isActive");

    console.log(`📊 Found ${users.length} users:`);
    users.forEach((user, index) => {
      console.log(
        `${index + 1}. Phone: ${user.phone}, Username: ${
          user.username
        }, Role: ${user.role}, Active: ${user.isActive}`
      );
    });

    const adminUsers = users.filter((user) => user.role === "ADMIN");
    console.log(`\n👑 Admin users: ${adminUsers.length}`);
    adminUsers.forEach((admin) => {
      console.log(`- ${admin.username} (${admin.phone})`);
    });

    // If no admin exists, create one
    if (adminUsers.length === 0) {
      console.log("\n📝 Creating admin user...");
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
    }
  } catch (error) {
    console.error("❌ Error checking users:", error);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 Database connection closed");
  }
};

checkUsers();
