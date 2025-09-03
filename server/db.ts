import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure WebSocket with SSL handling
neonConfig.webSocketConstructor = ws;
neonConfig.wsProxy = (host) => `${host}:443/v1`;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with proper SSL configuration
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: false, // Disable SSL for development environment
});

export { pool };
export const db = drizzle({ client: pool, schema });