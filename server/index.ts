import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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

  // ── One-time data migration: normalize "Mohali" → "SAS Nagar (Mohali)" ──
  try {
    const { db } = await import("./db");
    const { students, districtStatus } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    // 1. Fix students table
    const updatedStudents = await db
      .update(students)
      .set({ counselingDistrict: "SAS Nagar (Mohali)" })
      .where(eq(students.counselingDistrict, "Mohali"))
      .returning({ id: students.id });

    // 2. Fix district_status table — handle merge if both rows exist
    const [mohaliRow] = await db.select().from(districtStatus).where(eq(districtStatus.district, "Mohali"));
    const [sasRow] = await db.select().from(districtStatus).where(eq(districtStatus.district, "SAS Nagar (Mohali)"));

    let districtStatusFixed = 0;
    if (mohaliRow && sasRow) {
      // Both exist: delete the "Mohali" duplicate
      await db.delete(districtStatus).where(eq(districtStatus.district, "Mohali"));
      districtStatusFixed = 1;
    } else if (mohaliRow && !sasRow) {
      // Only "Mohali" exists: rename it
      await db.update(districtStatus).set({ district: "SAS Nagar (Mohali)" }).where(eq(districtStatus.district, "Mohali"));
      districtStatusFixed = 1;
    }

    if (updatedStudents.length > 0 || districtStatusFixed > 0) {
      log(`🔄 Normalized "Mohali" → "SAS Nagar (Mohali)": ${updatedStudents.length} students, ${districtStatusFixed} district status records`);
    }
  } catch (e) {
    console.error("District normalization migration error (non-fatal):", e);
  }
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
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
