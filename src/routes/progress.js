const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const telegramService = require("../services/telegramService"); // Assuming this service is adapted for Supabase or doesn't directly use Mongoose

// Helper function to get or create user progress record in Supabase
async function getOrCreateUserProgress(userId) {
  let { data: progress, error } = await supabase
    .from("user_progress") // Assuming table name is 'user_progress'
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Supabase get progress error:", error);
    throw error;
  }

  if (!progress) {
    // Create a new progress record if one doesn't exist
    const { data: newProgress, error: createError } = await supabase
      .from("user_progress")
      .insert([{
        user_id: userId,
        level: "Alpha Pup", // Default level
        experience: 0,
        experience_to_next_level: 100, // Example default
        streak: 0,
        achievements: [], // Assuming achievements are stored as JSONB or similar
        last_active_at: new Date(),
      }])
      .select("*")
      .single();

    if (createError) {
      console.error("Supabase create progress error:", createError);
      throw createError;
    }
    progress = newProgress;
  }
  return progress;
}

// Helper function to calculate level based on experience (example logic)
function calculateLevel(experience) {
  // Replace with your actual level calculation logic
  if (experience >= 1000) return { level: "Alpha Wolf", next: null };
  if (experience >= 500) return { level: "Beta Wolf", next: 1000 };
  if (experience >= 100) return { level: "Omega Pup", next: 500 };
  return { level: "Alpha Pup", next: 100 };
}

// Get user progress
router.get("/", async (req, res, next) => { // Changed route from /progress to / to match index.js app.use('/api/progress', ...)
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }
    const userId = req.user.id;
    const progress = await getOrCreateUserProgress(userId);
    res.json(progress);
  } catch (error) {
    console.error("Error fetching progress:", error);
    next(error);
  }
});

// Add experience
router.post("/experience", async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }
    const userId = req.user.id;
    const { amount } = req.body;

    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ message: "Invalid experience amount." });
    }

    const currentProgress = await getOrCreateUserProgress(userId);
    const oldLevel = currentProgress.level;
    const newExperience = (currentProgress.experience || 0) + amount;

    // Calculate new level and experience needed for next level
    const levelInfo = calculateLevel(newExperience);
    const newLevel = levelInfo.level;
    const experienceToNextLevel = levelInfo.next;

    // Update streak (basic example: increment if last active was yesterday)
    const now = new Date();
    const lastActive = new Date(currentProgress.last_active_at);
    const isConsecutiveDay = (now.toDateString() !== lastActive.toDateString()) && 
                             (now.getTime() - lastActive.getTime() < 2 * 24 * 60 * 60 * 1000);
    const newStreak = isConsecutiveDay ? (currentProgress.streak || 0) + 1 : 1;

    // Update progress in Supabase
    const { data: updatedProgress, error: updateError } = await supabase
      .from("user_progress")
      .update({
        experience: newExperience,
        level: newLevel,
        experience_to_next_level: experienceToNextLevel,
        streak: newStreak,
        last_active_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .select("*")
      .single();

    if (updateError) {
      console.error("Supabase update experience error:", updateError);
      throw updateError;
    }

    // Notify on level up (if telegramService is adapted)
    if (newLevel !== oldLevel) {
      // await telegramService.handleLevelUp(userId, newLevel); // Uncomment if service is ready
      console.log(`User ${userId} leveled up to ${newLevel}`);
    }

    // TODO: Implement achievement checking logic based on Supabase data
    // await checkAndGrantAchievements(userId, updatedProgress);

    res.json(updatedProgress);

  } catch (error) {
    console.error("Error updating experience:", error);
    next(error);
  }
});

// Sync progress with Telegram (adapt telegramService if needed)
router.post("/sync-telegram", async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }
    // await telegramService.syncUserProgress(req.userId); // Uncomment if service is ready
    console.log(`Sync request for user ${req.user.id}`);
    res.json({ message: "Progress sync initiated (adapt service logic)" });
  } catch (error) {
    console.error("Error syncing progress:", error);
    next(error);
  }
});

// Get achievements (assuming achievements are stored in user_progress table)
router.get("/achievements", async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "User not authenticated." });
    }
    const userId = req.user.id;
    const progress = await getOrCreateUserProgress(userId);
    res.json(progress.achievements || []); // Return achievements array
  } catch (error) {
    console.error("Error fetching achievements:", error);
    next(error);
  }
});

// TODO: Add function checkAndGrantAchievements(userId, progressData)
// This function would query an 'achievements' table and compare requirements
// against the user's progressData (level, experience, streak, etc.)
// If new achievements are unlocked, update the 'achievements' array in the 'user_progress' table.

module.exports = router;

