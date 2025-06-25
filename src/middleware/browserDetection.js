const detectBrowser = (req, res, next) => {
  // Check if request is coming from Telegram WebApp
  const userAgent = req.get('User-Agent') || '';
  const isTelegramWebApp = userAgent.includes('TelegramBot') || 
                          req.headers['x-telegram-init-data'] ||
                          userAgent.includes('Telegram');
  
  // For API routes, we'll handle this in the telegramAuth middleware
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  // For non-API routes (serving React app), check if it's from browser
  if (!isTelegramWebApp) {
    // Redirect browser users to Telegram bot
    const telegramBotLink = 'https://t.me/alphawolftesting_bot';
    const redirectHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Alpha Wulf - Telegram Required</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            max-width: 400px;
            margin: 1rem;
          }
          .logo {
            font-size: 4rem;
            margin-bottom: 1rem;
          }
          h1 {
            margin: 0 0 1rem 0;
            font-size: 2rem;
            font-weight: 700;
          }
          p {
            margin: 0 0 2rem 0;
            font-size: 1.1rem;
            opacity: 0.9;
            line-height: 1.5;
          }
          .telegram-btn {
            display: inline-block;
            background: #229ED9;
            color: white;
            text-decoration: none;
            padding: 1rem 2rem;
            border-radius: 50px;
            font-weight: 600;
            font-size: 1.1rem;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(34, 158, 217, 0.3);
          }
          .telegram-btn:hover {
            background: #1e8bc3;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(34, 158, 217, 0.4);
          }
          .note {
            margin-top: 2rem;
            font-size: 0.9rem;
            opacity: 0.7;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🐺</div>
          <h1>Alpha Wulf</h1>
          <p>This app is only available through Telegram. Please open it in the Telegram app to continue.</p>
          <a href="${telegramBotLink}" class="telegram-btn">
            Open in Telegram
          </a>
          <p class="note">
            Don't have Telegram? Download it from your app store and search for @alphawolftesting_bot
          </p>
        </div>
      </body>
      </html>
    `;
    
    return res.status(200).send(redirectHTML);
  }
  
  next();
};

module.exports = detectBrowser;

