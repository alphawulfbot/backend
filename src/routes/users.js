const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");

// Note: The 'telegramAuth' middleware applied in index.js already verifies the user
// and attaches the user object from Supabase to req.user.

// Get user profile
router.get("/profile", async (req, res, next) => {
  try {
    // req.user is attached by the telegramAuth middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated or user ID missing." });
    }

    // The user object attached might already contain all necessary profile info.
    // If not, you could re-fetch, but usually, the middleware provides it.
    // For simplicity, we return the user object attached by the middleware.
    res.json(req.user);

  } catch (error) {
    console.error("Error fetching user profile:", error);
    next(error); // Pass error to the central error handler
  }
});

// Update user profile
router.put("/profile", async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated or user ID missing." });
    }

    const userId = req.user.id;
    const { username, first_name, last_name /* add other updatable fields */ } = req.body;

    // Prepare the update object with only the fields provided in the request
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    // Add other fields as needed

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No update fields provided." });
    }

    // Add updated_at timestamp
    updates.updated_at = new Date();

    // Perform the update in Supabase
    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select(); // Select the updated user data

    if (error) {
      console.error("Supabase profile update error:", error);
      // Handle potential specific errors, e.g., unique constraint violation for username
      if (error.code === '23505') { // Unique violation
          return res.status(409).json({ message: "Username already taken." });
      }
      throw error; // Pass other errors to the central handler
    }

    if (!data || data.length === 0) {
        return res.status(404).json({ message: "User not found after update attempt." });
    }

    res.json({ message: "Profile updated successfully", user: data[0] });

  } catch (error) {
    console.error("Error updating profile:", error);
    next(error); // Pass error to the central error handler
  }
});

// Delete user account - Be cautious with this endpoint!
router.delete("/profile", async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated or user ID missing." });
    }

    const userId = req.user.id;

    // Perform the delete operation in Supabase
    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) {
      console.error("Supabase profile delete error:", error);
      throw error; // Pass error to the central handler
    }

    // Note: Supabase delete doesn't typically return the deleted record count easily,
    // so we assume success if no error occurred.
    res.json({ message: "Account deleted successfully" });

  } catch (error) {
    console.error("Error deleting account:", error);
    next(error); // Pass error to the central error handler
  }
});

module.exports = router;

