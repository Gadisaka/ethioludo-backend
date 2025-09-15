// uploadRoute.js or inside your main server file
const express = require("express");
const multer = require("multer");
const { uploadImageToCloudinary } = require("./cloudinary");
const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/image", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await uploadImageToCloudinary(file);
    return res.status(200).json({ imageUrl: result.secure_url });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;
