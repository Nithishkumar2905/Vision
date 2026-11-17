# ACCESSPREP-X — Accessible AI Examination Preparation Platform (SSC MTS)

**ACCESSPREP-X** is an audio-first, AI-assisted competitive examination preparation platform engineered for blind, low-vision, and Persons with Disabilities (PwD) candidates preparing for the **Staff Selection Commission Multi-Tasking Staff (SSC MTS)** examination.

Compliant with **WCAG 2.1 AAA**, the **Rights of Persons with Disabilities (RPwD) Act 2016**, and **DoPT Compensatory Time & Scribe Guidelines**.

---

## 1. Project Overview & Key Features

- **100% Voice-First & Keyboard Accessible**: Global wake-word (`"Hey Vision"`), 10-priority `NavigationController`, continuous/push-to-talk Speech-to-Text (Web Speech API + OpenAI Whisper fallback), and Text-to-Speech (`window.speechSynthesis` with freeze recovery).
- **Spoken Human Verification (Audio CAPTCHA)**: Two-stage accessible candidate login and registration with spoken digit challenges and voice-dictated form fields.
- **400 Verified SSC MTS Questions**: Balanced across all 4 official subjects (100 questions each):
  1. *Numerical and Mathematical Ability* (Session I — +3 marks, 0 negative marking)
  2. *Reasoning Ability and Problem Solving* (Session I — +3 marks, 0 negative marking)
  3. *General Awareness* (Session II — +3 marks, -1 negative marking)
  4. *English Language and Comprehension* (Session II — +3 marks, -1 negative marking)
- **Non-Repeating 100-Question Mock Examination**: Tracks per-candidate question assignments across attempts so questions never repeat within a 400-question cycle, completely isolated from Voice Practice.
- **20-Question Pilot Demo Diagnostic**: Balanced 4-section diagnostic with deterministic 2-pass spoken acceptance and post-exam wrong-answer review dialogue.
- **Spoken Mathematical Voice Engine**: Parses spoken math expressions, normalizes formulas, and evaluates step-by-step derivations without leaking answers.
- **Adaptive BKT Mastery & SuperMemo SM-2 Revision Planner**: Tracks per-topic knowledge probability (`p_known`) and schedules optimal spaced-repetition reviews.
- **Live Transcript Workspace**: 4-tab workspace featuring Overview Audit Log, Voice Recognition Log, Live Dictation & Recording Studio (with `.TXT`/`.JSON`/`.CSV` export), and Transcript Privacy Controls.
- **Curriculum-Grounded AI Syllabus Tutor**: Powered by Google Gemini 2.5 Flash with deterministic offline syllabus fallbacks.

---

## 2. Architecture Summary

ACCESSPREP-X uses a **Feature-Oriented Modular Architecture**:
- **Frontend (`src/`)**:
  - `src/app/`: Application root, `PortalLayout`, `AppProviders`, and 18-screen `ScreenRouter`.
  - `src/features/`: 11 domain feature modules (`authentication`, `dashboard`, `mock-exam`, `voice-practice`, `transcript-workspace`, `accessibility`, `ai-tutor`, `revision-planner`, `progress`, `results`, `pilot-demo`).
  - `src/components/`: Categorised UI components (`common`, `ui`, `forms`, `feedback`, `navigation`, `accessibility`, `auth`, `dashboard`, `revision`).
  - `src/context/`, `src/hooks/`, `src/services/`, `src/lib/`, `src/types/`, `src/styles/`, `src/voice/`, `src/math/`.
- **Backend (`server/src/` & `server.ts`)**:
  - Modular Express 4 architecture separated into `config/`, `models/`, `repositories/`, `validators/`, `services/`, `controllers/`, `routes/`, `middleware/`, and `utils/`.
  - Dual-persistence repository (`src/db/repository.ts`) supporting PostgreSQL (`pg`) with automatic fallback to an atomic JSON file store (`src/data/app_database.json`).

---

## 3. Quick Start & Setup Instructions

### Prerequisites
- **Node.js**: v20+ (tested on Node v24)
- **npm**: v10+

### Installation & Local Development
```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env

# 3. Start full-stack development server (Express API + Vite HMR on http://localhost:3000)
npm run dev
```

---

## 4. Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express + Vite development server on `http://localhost:3000`. |
| `npm run build` | Builds the production React + Tailwind v4 frontend bundle into `dist/`. |
| `npm run lint` | Runs strict TypeScript type-checking (`tsc --noEmit`). |
| `npm test` | Executes all 21 automated unit, accessibility, and integration test suites (236 tests). |
| `npm run db:seed` | Seeds PostgreSQL with the schema and 400 verified SSC MTS questions. |

---

## 5. Documentation Index

- **Architecture**:
  - [Complete Project Audit (`docs/architecture/PROJECT_AUDIT.md`)](docs/architecture/PROJECT_AUDIT.md)
  - [Project Structure Reference (`docs/architecture/PROJECT_STRUCTURE.md`)](docs/architecture/PROJECT_STRUCTURE.md)
  - [Architecture Overview (`docs/architecture/ARCHITECTURE_OVERVIEW.md`)](docs/architecture/ARCHITECTURE_OVERVIEW.md)
  - [Refactoring Changelog (`docs/architecture/REFACTOR_CHANGELOG.md`)](docs/architecture/REFACTOR_CHANGELOG.md)
- **Feature Modules**:
  - [Authentication & Audio CAPTCHA (`docs/modules/AUTHENTICATION.md`)](docs/modules/AUTHENTICATION.md)
  - [Mock Examination & Rotation (`docs/modules/MOCK_EXAMINATION.md`)](docs/modules/MOCK_EXAMINATION.md)
  - [Voice Practice (`docs/modules/VOICE_PRACTICE.md`)](docs/modules/VOICE_PRACTICE.md)
  - [Transcript Workspace (`docs/modules/TRANSCRIPT_WORKSPACE.md`)](docs/modules/TRANSCRIPT_WORKSPACE.md)
  - [Accessibility & Vision Mode (`docs/modules/ACCESSIBILITY.md`)](docs/modules/ACCESSIBILITY.md)
  - [AI Syllabus Tutor (`docs/modules/AI_TUTOR.md`)](docs/modules/AI_TUTOR.md)
  - [Adaptive Revision Planner (`docs/modules/REVISION_PLANNER.md`)](docs/modules/REVISION_PLANNER.md)
- **API, Database, Setup & Deployment**:
  - [REST API Reference (`docs/api/API_REFERENCE.md`)](docs/api/API_REFERENCE.md)
  - [Local Development Setup (`docs/setup/LOCAL_DEVELOPMENT.md`)](docs/setup/LOCAL_DEVELOPMENT.md)
  - [Environment Configuration (`docs/setup/ENVIRONMENT_CONFIGURATION.md`)](docs/setup/ENVIRONMENT_CONFIGURATION.md)
  - [Database Setup (`docs/setup/DATABASE_SETUP.md`)](docs/setup/DATABASE_SETUP.md)
  - [Troubleshooting Guide (`docs/setup/TROUBLESHOOTING.md`)](docs/setup/TROUBLESHOOTING.md)
  - [Deployment Guide (`docs/deployment/DEPLOYMENT_GUIDE.md`)](docs/deployment/DEPLOYMENT_GUIDE.md)
