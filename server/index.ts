import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Set timezone to system timezone for date/time operations
// This ensures dates are interpreted in the local timezone
// If TZ is not set, Node.js will use the system's default timezone
if (!process.env.TZ) {
  // Try to detect system timezone (works on most systems)
  try {
    const { execSync } = require('child_process');
    let tz: string;
    
    if (process.platform === 'win32') {
      // Windows - get timezone identifier
      try {
        tz = execSync('tzutil /g', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        process.env.TZ = tz;
      } catch {
        // Fallback for Windows
        process.env.TZ = 'UTC';
      }
    } else {
      // Unix-like systems (Linux, macOS)
      try {
        // Try timedatectl first (Linux)
        tz = execSync('timedatectl show -p Timezone --value 2>/dev/null', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (tz) {
          process.env.TZ = tz;
        } else {
          throw new Error('timedatectl failed');
        }
      } catch {
        // Fallback: try reading /etc/timezone (Linux) or system timezone (macOS)
        try {
          const fs = require('fs');
          if (fs.existsSync('/etc/timezone')) {
            tz = fs.readFileSync('/etc/timezone', 'utf8').trim();
            process.env.TZ = tz;
          } else {
            // macOS or other systems - use system default
            process.env.TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          }
        } catch {
          // Final fallback
          process.env.TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }
      }
    }
  } catch (error) {
    // If timezone detection fails, use system default or UTC
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = systemTz || 'UTC';
    console.warn('⚠️  Could not detect system timezone via command, using:', process.env.TZ);
  }
}

// Log the timezone being used
const currentTz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const now = new Date();
console.log(`🌍 Application timezone: ${currentTz}`);
console.log(`🕐 Current server time: ${now.toLocaleString('en-US', { timeZone: currentTz })} (${now.toISOString()} UTC)`);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const listenConfig =
    process.platform === "linux"
      ? { port, host: "0.0.0.0", reusePort: true }
      : { port, host: "0.0.0.0" };

  server.listen(listenConfig as any, () => {
    log(`serving on port ${port}`);
  });
})();
