import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/fidc_intel",
});

pool.on("error", (err) => {
  console.error("Unexpected pool error", err);
});

export default pool;
