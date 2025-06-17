const supabase = require("../config/supabase");

// Note: This service assumes you have Supabase tables like 'ads', 'users', 
// 'ad_clicks', 'ad_views'. Adjust table/column names as per your actual schema.

class AdService {
  constructor() {
    // Define reward multipliers or amounts if needed
    // this.rewardMultiplier = 1.5; 
  }

  async getAdForUser(userId, adType) {
    // Fetch user level first to target ads correctly
    const { data: user, error: userError } = await supabase
      .from("users") // Assuming user level is stored in the users table
      .select("level")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.error("Error fetching user for ad targeting:", userError);
      throw new Error(userError?.message || "User not found for ad targeting");
    }

    const userLevel = user.level; // Adjust if level is stored elsewhere

    // Fetch a suitable, active ad from Supabase
    // Simple approach: fetch one matching ad. Random selection might need DB functions or fetching multiple.
    const now = new Date().toISOString();
    const { data: ads, error: adError } = await supabase
      .from("ads")
      .select("id, type, platform, ad_unit_id") // Select necessary fields
      .eq("status", "active")
      .eq("type", adType)
      .lte("target_level", userLevel) // Assuming target_level column exists
      .lte("start_date", now)
      .gte("end_date", now)
      .limit(1); // Get one potential ad

    if (adError) {
      console.error("Supabase get ad error:", adError);
      throw adError;
    }

    // TODO: Implement random selection if multiple ads match and are returned
    return ads && ads.length > 0 ? ads[0] : null;
  }

  async recordAdClick(adId, userId) {
    // Record the click event in a dedicated table (e.g., ad_clicks)
    const { error } = await supabase
      .from("ad_clicks") // Assuming table name
      .insert([{ 
        ad_id: adId, 
        user_id: userId, 
        // timestamp is handled by Supabase default value or trigger
      }]);

    if (error) {
      console.error("Supabase record ad click error:", error);
      // Don't necessarily throw, maybe just log, depending on requirements
      // throw error; 
      return false; // Indicate failure
    }
    return true; // Indicate success
  }

  async processAdReward(adId, userId) {
    // 1. Verify the ad exists and get reward details
    const { data: ad, error: adError } = await supabase
      .from("ads")
      .select("id, reward_type, reward_amount")
      .eq("id", adId)
      .single();

    if (adError || !ad) {
      console.error("Error fetching ad for reward:", adError);
      throw new Error(adError?.message || "Ad not found for reward processing");
    }

    // 2. Record the ad view
    const { error: viewError } = await supabase
      .from("ad_views") // Assuming table name
      .insert([{ 
          ad_id: adId, 
          user_id: userId 
      }]);

    if (viewError) {
      console.error("Supabase record ad view error:", viewError);
      // Continue to grant reward even if view logging fails?
    }

    // 3. Grant the reward to the user
    // Fetch current balance/status first
    const { data: user, error: userFetchError } = await supabase
        .from("users")
        .select("balance, premium_days") // Select fields to update
        .eq("id", userId)
        .single();

    if (userFetchError || !user) {
        console.error("Error fetching user for reward:", userFetchError);
        throw new Error(userFetchError?.message || "User not found for reward granting");
    }

    // Prepare updates based on reward type
    const updates = {};
    if (ad.reward_type === "points" || ad.reward_type === "balance") { // Assuming 'points' means balance
      updates.balance = (user.balance || 0) + ad.reward_amount;
    } else if (ad.reward_type === "premium") {
      // Handle premium days update logic (e.g., add days to current date or expiry date)
      // updates.premium_days = (user.premium_days || 0) + ad.reward_amount;
      console.warn("Premium reward logic not fully implemented.");
    } else {
        console.warn(`Unknown reward type: ${ad.reward_type}`);
        return false; // Indicate reward couldn't be processed
    }

    if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date();
        const { error: updateError } = await supabase
            .from("users")
            .update(updates)
            .eq("id", userId);

        if (updateError) {
            console.error("Supabase user reward update error:", updateError);
            throw updateError;
        }
    } else {
        return false; // No valid reward to apply
    }

    return true; // Indicate success
  }

  async getAdMetrics(adId) {
    // Fetch counts from related tables
    const { count: viewCount, error: viewError } = await supabase
      .from("ad_views")
      .select("*", { count: "exact", head: true })
      .eq("ad_id", adId);

    const { count: clickCount, error: clickError } = await supabase
      .from("ad_clicks")
      .select("*", { count: "exact", head: true })
      .eq("ad_id", adId);
      
    // TODO: Add queries for unique viewers/clickers if needed (more complex)

    if (viewError || clickError) {
        console.error("Error fetching ad metrics:", viewError || clickError);
        // Return partial data or throw?
        return { totalViews: null, totalClicks: null, ctr: null };
    }

    const totalViews = viewCount || 0;
    const totalClicks = clickCount || 0;
    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    return {
      totalViews,
      totalClicks,
      // uniqueViewers: ..., // Requires separate query
      // uniqueClickers: ..., // Requires separate query
      ctr
    };
  }

  async createAd(adData) {
    // Ensure data matches your Supabase 'ads' table schema
    const { data, error } = await supabase
      .from("ads")
      .insert([adData]) // adData should be an object matching table columns
      .select();

    if (error) {
      console.error("Supabase create ad error:", error);
      throw error;
    }
    return data && data.length > 0 ? data[0] : null;
  }

  async updateAdStatus(adId, status) {
    const { data, error } = await supabase
      .from("ads")
      .update({ status: status, updated_at: new Date() })
      .eq("id", adId)
      .select();

    if (error) {
      console.error("Supabase update ad status error:", error);
      throw error;
    }
    // Check if the update actually affected a row
    return data && data.length > 0;
  }
}

// Export an instance of the service
module.exports = new AdService();

