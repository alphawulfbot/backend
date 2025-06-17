const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");
const supabase = require("../config/supabase");

// Note: This service assumes Supabase tables like 'users', 'user_progress', 'telegram_users' (or similar)
// Adjust table/column names as per your actual schema.

class TelegramBotService {
  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error("TELEGRAM_BOT_TOKEN environment variable is required");
    }
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
    this.initializeCommands();
  }

  initializeCommands() {
    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId,
        "Welcome to Alpha Wulf! 🐺\n\n" +
        "Use the Alpha Wulf Telegram Web App to start playing and earning rewards.\n\n" +
        "Available commands:\n" +
        "/progress - Check your progress\n" +
        "/achievements - View your achievements\n" +
        "/streak - Check your current streak\n" +
        "/help - Show this help message"
      );
    });

    // Helper to get Supabase user ID from Telegram Chat ID
    async function getSupabaseUserId(chatId) {
        const { data, error } = await supabase
            .from("users") // Assuming telegram_id is in the main users table
            .select("id")
            .eq("telegram_id", chatId)
            .maybeSingle();
        if (error) {
            console.error("Error fetching user by telegram_id:", error);
            return null;
        }
        return data ? data.id : null;
    }

    // Progress command
    this.bot.onText(/\/progress/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = await getSupabaseUserId(chatId);

      if (!userId) {
        return this.bot.sendMessage(chatId, "Account not linked or found. Please use the Alpha Wulf Web App.");
      }

      // Fetch progress from Supabase user_progress table
      const { data: userProgress, error } = await supabase
        .from("user_progress")
        .select("level, experience, experience_to_next_level, streak, achievements")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !userProgress) {
        console.error("Error fetching progress for bot command:", error);
        return this.bot.sendMessage(chatId, "Could not retrieve progress data.");
      }

      const progressMessage = `
📊 Your Progress:
Level: ${userProgress.level}
Experience: ${userProgress.experience || 0}/${userProgress.experience_to_next_level || 'N/A'}
Streak: ${userProgress.streak || 0} days
Achievements: ${userProgress.achievements?.length || 0}
      `.trim();

      await this.bot.sendMessage(chatId, progressMessage);
    });

    // Achievements command
    this.bot.onText(/\/achievements/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = await getSupabaseUserId(chatId);

        if (!userId) {
            return this.bot.sendMessage(chatId, "Account not linked or found. Please use the Alpha Wulf Web App.");
        }

        const { data: userProgress, error } = await supabase
            .from("user_progress")
            .select("achievements") // Assuming achievements are stored as JSONB
            .eq("user_id", userId)
            .maybeSingle();

        if (error || !userProgress || !userProgress.achievements || userProgress.achievements.length === 0) {
            return this.bot.sendMessage(chatId, "No achievements unlocked yet or data unavailable.");
        }

        // Assuming achievements array contains objects like { name: '...', description: '...', icon: '🏆' }
        const achievementsList = userProgress.achievements
            .map(ach => `${ach.icon || '🏆'} ${ach.name}\n${ach.description}`)
            .join('\n\n');

        await this.bot.sendMessage(chatId, `🏆 Your Achievements:\n\n${achievementsList}`);
    });

    // Streak command
    this.bot.onText(/\/streak/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = await getSupabaseUserId(chatId);

        if (!userId) {
            return this.bot.sendMessage(chatId, "Account not linked or found. Please use the Alpha Wulf Web App.");
        }

        const { data: userProgress, error } = await supabase
            .from("user_progress")
            .select("streak, last_active_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (error || !userProgress) {
            return this.bot.sendMessage(chatId, "Could not retrieve streak data.");
        }

        const streakMessage = `
🔥 Your Streak:
Current Streak: ${userProgress.streak || 0} days
Last Active: ${userProgress.last_active_at ? new Date(userProgress.last_active_at).toLocaleDateString() : 'N/A'}
        `.trim();

        await this.bot.sendMessage(chatId, streakMessage);
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      await this.bot.sendMessage(chatId,
        "Alpha Wulf Help 🐺\n\n" +
        "1. Open the Alpha Wulf Web App to start playing\n" +
        "2. Complete daily tasks to earn rewards\n" +
        "3. Level up to unlock new features\n" +
        "4. Invite friends to earn bonus rewards\n\n" +
        "Need more help? Contact our support team."
      );
    });
  }

  async verifyTelegramData(initData) {
    try {
      const data = new URLSearchParams(initData);
      const hash = data.get('hash');
      data.delete('hash');
      
      const dataCheckString = Array.from(data.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(process.env.TELEGRAM_BOT_TOKEN)
        .digest();

      const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      if (calculatedHash !== hash) {
        return null;
      }

      const user = JSON.parse(data.get('user'));
      return { user };
    } catch (error) {
      console.error('Error verifying Telegram data:', error);
      return null;
    }
  }

  // --- Notification Methods (Require Telegram User ID) ---
  // These methods now need the Telegram Chat ID to send messages.
  // You'll need to fetch this ID from Supabase based on the Supabase User ID.

  async getTelegramChatId(supabaseUserId) {
      const { data, error } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("id", supabaseUserId)
          .single();
      if (error || !data || !data.telegram_id) {
          console.error(`Error fetching telegram_id for user ${supabaseUserId}:`, error);
          return null;
      }
      return data.telegram_id;
  }

  async sendNotification(supabaseUserId, message) {
    if (!this.bot) return;
    
    const telegramId = await this.getTelegramChatId(supabaseUserId);
    if (!telegramId) {
      console.warn(`Could not send notification to Supabase user ${supabaseUserId}: Telegram ID not found.`);
      return;
    }

    try {
      await this.bot.sendMessage(telegramId, message);
    } catch (error) {
      console.error(`Error sending notification to ${telegramId}:`, error.response?.body || error.message);
    }
  }

  async sendAchievementNotification(supabaseUserId, achievement) {
    const message = `
🏆 Achievement Unlocked!
${achievement.icon || '🏅'} ${achievement.name}
${achievement.description}
    `.trim();
    await this.sendNotification(supabaseUserId, message);
  }

  // Example: Send level up notification
  async sendLevelUpNotification(supabaseUserId, newLevel) {
    const message = `
🎉 Level Up!
You've reached level ${newLevel}!
Keep up the great work!
      `.trim();
    await this.sendNotification(supabaseUserId, message);
  }

  // Add other notification methods similarly...

}

// Export an instance of the service
module.exports = new TelegramBotService();

