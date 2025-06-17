const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

// This route will be protected by the telegramAuth middleware defined in index.js
// The middleware verifies the initData, finds/creates the user, generates a JWT,
// and attaches user info and the token to the request object (req.user, req.token).
router.post("/telegram", (req, res) => {
  // The telegramAuth middleware should have already run and attached user/token
  if (req.user && req.token) {
    res.json({
      message: "Telegram login successful",
      token: req.token,
      user: req.user, // Send back the user info attached by the middleware
    });
  } else {
    // This case should technically not be reached if the middleware is working correctly
    res.status(401).json({ message: "Authentication failed during middleware processing." });
  }
});

// Keep other auth routes if needed (e.g., /me, /refresh, /logout), 
// but remove the old email/password /login and /register routes 
// as they are not used for Telegram Web App auth.

// Example /me route (assuming JWT authentication middleware is applied elsewhere or added here)
// router.get("/me", authMiddleware, async (req, res) => { ... });

module.exports = router;

