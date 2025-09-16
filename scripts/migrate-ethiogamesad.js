const mongoose = require("mongoose");
const AdsandLinks = require("../model/AdsandLinks");

// Database connection
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/ludo-game"
    );
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};

const migrateEthiogamesAd = async () => {
  try {
    console.log("Starting migration for ethiogamesad field...");

    // Find all ads documents
    const adsDocuments = await mongoose.connection.db
      .collection("adsandlinks")
      .find({})
      .toArray();

    for (const doc of adsDocuments) {
      console.log(`Processing document: ${doc._id}`);

      // Check if ethiogamesad exists and is not an array
      if (doc.ethiogamesad && !Array.isArray(doc.ethiogamesad)) {
        console.log("Found ethiogamesad as object, converting to array...");

        // Convert the object to an array
        const convertedEthiogamesad = [doc.ethiogamesad];

        // Update the document
        await mongoose.connection.db.collection("adsandlinks").updateOne(
          { _id: doc._id },
          {
            $set: {
              ethiogamesad: convertedEthiogamesad,
            },
          }
        );

        console.log(
          `✅ Converted ethiogamesad from object to array for document ${doc._id}`
        );
      } else if (!doc.ethiogamesad) {
        console.log(
          "Found document without ethiogamesad, setting empty array..."
        );

        // Set empty array if field doesn't exist
        await mongoose.connection.db.collection("adsandlinks").updateOne(
          { _id: doc._id },
          {
            $set: {
              ethiogamesad: [],
            },
          }
        );

        console.log(`✅ Set empty ethiogamesad array for document ${doc._id}`);
      } else if (Array.isArray(doc.ethiogamesad)) {
        console.log(
          `✅ Document ${doc._id} already has ethiogamesad as array, skipping`
        );
      }
    }

    console.log("Migration completed successfully!");

    // Verify the migration
    const updatedDocs = await mongoose.connection.db
      .collection("adsandlinks")
      .find({})
      .toArray();
    console.log("\n=== Migration Verification ===");
    for (const doc of updatedDocs) {
      console.log(`Document ${doc._id}:`);
      console.log(
        `  ethiogamesad type: ${
          Array.isArray(doc.ethiogamesad) ? "array" : typeof doc.ethiogamesad
        }`
      );
      console.log(
        `  ethiogamesad length: ${
          doc.ethiogamesad ? doc.ethiogamesad.length : "N/A"
        }`
      );
    }
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
};

const main = async () => {
  try {
    await connectDB();
    await migrateEthiogamesAd();
    console.log("\n🎉 Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("Migration script failed:", error);
    process.exit(1);
  }
};

// Run the migration
main();
