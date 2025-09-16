#!/usr/bin/env node

/**
 * Script to seed banks data
 * Usage: node scripts/seedBanks.js
 */

require("dotenv").config();
const { seedBanks } = require("../seed/banks");
const mongoose = require("mongoose");

const runSeed = async () => {
  try {
    console.log("🌱 Starting bank seeding...");

    // Try multiple database URIs to find the correct one
    const possibleUris = [process.env.MONGO_URI].filter(Boolean);

    let connected = false;
    for (const uri of possibleUris) {
      try {
        console.log(`🔌 Trying to connect to: ${uri}`);
        await mongoose.connect(uri);
        console.log(`✅ Connected to MongoDB: ${uri}`);
        connected = true;
        break;
      } catch (err) {
        console.log(`❌ Failed to connect to: ${uri}`);
        await mongoose.disconnect();
      }
    }

    if (!connected) {
      throw new Error("Could not connect to any MongoDB instance");
    }

    // Run the seed function
    await seedBanks();

    console.log("🎉 Bank seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Bank seeding failed:", error);
    process.exit(1);
  }
};

// Run the seed if this file is executed directly
if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
