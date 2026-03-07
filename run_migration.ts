import { neon } from '@neondatabase/serverless';
import fs from "fs/promises";
import path from "path";

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL must be set");
    }
    const sqlConnection = neon(process.env.DATABASE_URL);

    try {
        const rawSql = await fs.readFile(path.join(process.cwd(), "migrate_districts.sql"), "utf-8");
        const queries = rawSql
            .split(';')
            .map(q => q.trim())
            .filter(q => q.length > 0 && !q.startsWith('--'));

        console.log("Running migration sequentially...");

        for (const query of queries) {
            console.log("Executing:", query);
            await sqlConnection(query);
        }

        console.log("Migration completed successfully.");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

runMigration();
