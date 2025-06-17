const express = require("express");
const cors = require("cors");
const http = require("http");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const supabase = require("./config/supabase");
const path = require("path");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");
const os = require("os");

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize services (Remove RealtimeService for now, will be replaced by Supabase Realtime)
const telegramBotService = require("./services/telegramBot");
const adService = require("./services/adService");

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use(limiter);

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Alpha Wulf API",
      version: "1.0.0",
      description: "API documentation for Alpha Wulf application",
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: "Development server",
      },
    ],
  },
  apis: ["./src/routes/*.js"], // Path to the API routes
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Middleware
app.use(cors({
  origin: ['https://frontend-uzy8.onrender.com', 'https://t.me/alphawulf_bot'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data'],
  credentials: true
}));
app.use(express.json());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, "../../frontend/build")));

// Root route handler
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Alpha Wulf API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    documentation: "/api-docs",
  });
});

// Enhanced health check endpoint
app.get("/health", (req, res) => {
  const healthData = {
    status: "healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    system: {
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
      },
      cpu: {
        cores: os.cpus().length,
        load: os.loadavg(),
      },
      platform: os.platform(),
      uptime: os.uptime(),
    },
    services: {
      // Check if Supabase client exists as a basic connectivity check
      supabase: supabase ? "initialized" : "not initialized",
      telegram: telegramBotService ? "initialized" : "not initialized",
    },
  };
  res.json(healthData);
});

// Telegram Web App Authentication Middleware (using Supabase)
const telegramAuth = async (req, res, next) => {
  try {
    const initData = req.headers["x-telegram-init-data"];
    if (!initData) {
      return res.status(401).json({ error: "No Telegram data provided" });
    }

    // Verify Telegram Web App data using the bot service
    const validationResult = await telegramBotService.verifyTelegramData(initData);
    if (!validationResult || !validationResult.user) {
      console.error("Telegram data verification failed:", validationResult);
      return res.status(401).json({ error: "Invalid Telegram data" });
    }
    const telegramUser = validationResult.user;

    // Get or create user in Supabase
    const { data: existingUser, error: userError } = await supabase
      .from("users")
      .select("id, telegram_id, username, first_name, last_name, balance, level, level_points")
      .eq("telegram_id", telegramUser.id)
      .maybeSingle();

    if (userError) {
      console.error("Supabase user fetch error:", userError);
      throw userError;
    }

    let appUser;
    if (!existingUser) {
      // Create new user if not found
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert([{
          telegram_id: telegramUser.id,
          username: telegramUser.username,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name,
          balance: 0,
          level: "Alpha Pup",
          level_points: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select("id, telegram_id, username, first_name, last_name, balance, level, level_points")
        .single();

      if (createError) {
        console.error("Supabase user creation error:", createError);
        throw createError;
      }
      appUser = newUser;
    } else {
      appUser = existingUser;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: appUser.id, telegramId: appUser.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    req.user = appUser;
    req.token = token;
    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);
    res.status(401).json({ error: "Authentication failed" });
  }
};

// API Routes - Apply telegramAuth middleware to protected routes
// The /api/auth/telegram route itself needs the middleware to process the login
app.use("/api/auth", limiter, telegramAuth, require("./routes/auth")); // Apply middleware here for the login route
app.use("/api/users", limiter, telegramAuth, require("./routes/users"));
app.use("/api/progress", limiter, telegramAuth, require("./routes/progress"));
app.use("/api/ads", limiter, telegramAuth, require("./routes/ads"));

// Enhanced error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // Handle specific error types (add Supabase errors if needed)
  if (err.name === "ValidationError") { // Keep if using any validation library
    return res.status(400).json({
      error: "Validation Error",
      details: err.message,
    });
  }

  if (err.name === "UnauthorizedError" || err.status === 401) {
    return res.status(401).json({
      error: "Unauthorized",
      message: err.message || "Invalid token or authentication failure",
    });
  }

  if (err.name === "RateLimitExceeded") {
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please try again later.",
    });
  }

  // Default error handler
  res.status(err.status || 500).json({
    error: err.name || "Internal Server Error",
    message: err.message || "Something went wrong",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

app.use(errorHandler);

// Handle React routing, return all requests to React app
// This should come after all API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/build", "index.html"));
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
  console.log(`Health check at http://localhost:${PORT}/health`);
  console.log(`API Documentation at http://localhost:${PORT}/api-docs`);
});

