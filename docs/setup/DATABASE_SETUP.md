# Database Setup & Dual-Persistence Guide

## 1. Dual-Persistence Architecture
ACCESSPREP-X implements `IDataRepository` (`src/db/repository.ts`) with two interchangeable engines:
1. **`PostgresRepository`**: Uses `pg` connection pooling (`src/db/db_pool.ts`) and schema DDL (`src/db/schema.sql`).
2. **`FileJsonRepository`**: Uses atomic JSON persistence (`src/data/app_database.json`) seeded automatically from `src/data/ssc_mts_questions.json` (400 verified SSC MTS questions).

## 2. Initializing PostgreSQL (Optional)
If PostgreSQL is running locally:
```bash
psql -U postgres -c "CREATE DATABASE accessprep_x;"
npm run db:seed
```
You can inspect live database status at any time via `GET /api/db/status` or trigger idempotent schema migration via `POST /api/db/migrate`.
