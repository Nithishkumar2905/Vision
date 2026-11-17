# Environment Configuration Guide

Copy `.env.example` to `.env` in the project root:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port for the Express + Vite server. |
| `NODE_ENV` | `development` | Runtime environment (`development`, `production`, `test`). |
| `GEMINI_API_KEY` | — | Google Gemini API key for live AI Tutor Scribe responses (falls back to deterministic syllabus explanations if unset). |
| `DATABASE_URL` | — | Optional full PostgreSQL connection string. |
| `PGHOST` | `localhost` | PostgreSQL host (used when `DATABASE_URL` is unset). |
| `PGPORT` | `5432` | PostgreSQL port. |
| `PGUSER` | `postgres` | PostgreSQL username. |
| `PGPASSWORD` | `""` | PostgreSQL password. |
| `PGDATABASE` | `accessprep_x` | PostgreSQL database name. |
| `DISABLE_HMR` | `false` | Disables Vite Hot Module Replacement when set to `true`. |
