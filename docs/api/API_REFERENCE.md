# ACCESSPREP-X — REST API Reference

All backend endpoints are mounted under `/api` in `server/src/routes/api.routes.ts`.

| Category | Method & Endpoint | Description |
| :--- | :--- | :--- |
| **Health & DB** | `GET /api/health` | Returns server status, active DB engine, and question count (400). |
| **Health & DB** | `GET /api/db/status` | Returns PostgreSQL connection status and latest migration report. |
| **Health & DB** | `POST /api/db/migrate` | Runs idempotent schema migration and seed verification. |
| **Authentication** | `GET /api/auth/challenge` | Generates a 4-digit spoken Audio CAPTCHA challenge. |
| **Authentication** | `POST /api/auth/verify-challenge` | Verifies spoken/typed Audio CAPTCHA response and returns a single-use token. |
| **Authentication** | `POST /api/auth/validate-credentials` | Validates Roll Number/Email and Password before issuing a CAPTCHA challenge. |
| **Authentication** | `POST /api/auth/login` | Completes candidate login and returns profile + accessibility settings. |
| **Authentication** | `POST /api/auth/register` | Registers a new candidate and initializes PwD accessibility settings. |
| **Questions** | `GET /api/questions` | Queries the 400 verified SSC MTS questions by subject, topic, difficulty, or search term. |
| **Questions** | `GET /api/subjects` | Lists all 4 SSC MTS subjects with topic counts and question counts. |
| **Voice Practice** | `POST /api/practice/submit` | Evaluates a practice attempt and updates BKT mastery + SM-2 revision schedule. |
| **Mock Exam** | `GET /api/mock/rotation-status` | Returns candidate's current non-repeating rotation cycle status. |
| **Mock Exam** | `POST /api/mock/start` | Starts or resumes a non-repeating 100-question Mock Examination. |
| **Mock Exam** | `POST /api/mock/progress` | Auto-saves in-progress mock exam answers, timer, and question index. |
| **Mock Exam** | `POST /api/mock/submit` | Evaluates and records a completed Mock Examination attempt. |
| **Mock Exam** | `POST /api/mock/reset-cycle` | Resets the candidate's mock exam question rotation cycle. |
| **Math Engine** | `POST /api/math/parse` | Parses spoken mathematical expressions into normalized syntax and AST. |
| **Math Engine** | `POST /api/math/evaluate` | Evaluates or simplifies a mathematical expression without leaking exam answers. |
| **Pilot Demo** | `GET /api/diagnostic/questions` | Returns 20 balanced diagnostic questions across the 4 SSC MTS sections. |
| **Pilot Demo** | `POST /api/diagnostic/submit` | Scores and persists a 20-question diagnostic attempt with BKT updates. |
| **Revision** | `GET /api/revision/queue` | Returns due and upcoming SM-2 spaced repetition cards. |
| **Revision** | `POST /api/revision/review` | Records an SM-2 flashcard recall quality rating (`0–5`). |
| **Analytics** | `GET /api/mastery` | Returns per-topic Bayesian Knowledge Tracing (`p_known`) records. |
| **Analytics** | `GET /api/progress/analytics` | Returns comprehensive candidate KPIs, subject breakdowns, and readiness index. |
| **Transcripts** | `GET /api/transcripts` | Retrieves candidate's voice recognition audit log. |
| **Transcripts** | `POST /api/transcripts` | Appends a voice recognition transcript entry. |
| **Transcripts** | `DELETE /api/transcripts` | Clears candidate's stored voice transcripts. |
| **AI Tutor** | `POST /api/tutor/chat` | Returns curriculum-grounded Gemini 2.5 Flash or deterministic syllabus explanations. |
