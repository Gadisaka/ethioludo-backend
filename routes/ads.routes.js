const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  getAds,
  uploadSingleImage,
  uploadMultipleImages,
  deleteImage,
  saveAds,
  updateSocialLinks,
} = require("../controllers/ads.controller");
const { authenticateToken } = require("../middleware/authMiddleware");

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10, // Maximum 10 files for multiple uploads
  },
  fileFilter: (req, file, cb) => {
    // Check if file is an image
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET /admin/ads - Get all ads
router.get("/", getAds);

// POST /admin/ads/upload - Upload single image
router.post("/upload", upload.single("image"), uploadSingleImage);

// POST /admin/ads/upload-multiple - Upload multiple images
router.post(
  "/upload-multiple",
  upload.array("images", 10),
  uploadMultipleImages
);

// DELETE /admin/ads/delete - Delete image
router.delete("/delete", deleteImage);

// POST /admin/ads/save - Save all ads
router.post("/save", saveAds);

// PUT /admin/ads/social-links - Update social links
router.put("/social-links", updateSocialLinks);

module.exports = router;
