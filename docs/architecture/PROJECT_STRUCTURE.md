# ACCESSPREP-X — Project Structure Reference

## Overview

ACCESSPREP-X follows a **Feature-Oriented Modular Architecture** across both the React 19 + TypeScript frontend (`src/`) and the Express 4 + Dual-Persistence backend (`server/src/`). Backward-compatible barrel exports are maintained in `src/screens/*`, `src/components/*`, `src/utils/*`, and `src/db/*` so all 21 automated test suites and runtime scripts resolve without path breakage.

---

## Directory Tree

```text
ACCESSPREP-X/
│
├── public/
│   ├── assets/                        # Static bundles & reference archives
│   └── manifest.json                  # Web App Manifest for accessible PWA support
│
├── src/
│   ├── app/                           # Application shell, router, providers & layouts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── layouts/
│   │   │   └── PortalLayout.tsx
│   │   ├── providers/
│   │   │   └── AppProviders.tsx
│   │   └── routes/
│   │       └── ScreenRouter.tsx
│   │
│   ├── components/                    # Reusable, categorized UI & accessibility components
│   │   ├── common/                    # ErrorBoundary, EmptyState, LoadingSkeleton
│   │   ├── ui/                        # AccessibleProgressBar
│   │   ├── forms/                     # AccessibleFormField, VoiceInputButton
│   │   ├── feedback/                  # AuthenticationErrorMessage, PageEntryHelpBanner, ScreenNavigationDisclaimer
│   │   ├── navigation/                # Header, Navigation
│   │   ├── accessibility/             # AudioToolbar, AudioCaptchaControls, VoiceGuidanceControls
│   │   ├── auth/                      # Authentication UI primitives
│   │   ├── dashboard/                 # BI analytics charts, gauges & dashboard widgets
│   │   └── revision/                  # SM-2 spaced repetition UI components
│   │
│   ├── features/                      # Feature-bounded domain modules
│   │   ├── authentication/            # Login, Registration, Audio CAPTCHA, Spoken Dictation
│   │   ├── dashboard/                 # Student Dashboard, Welcome & BI KPI hooks
│   │   ├── mock-exam/                 # 100-Q Mock Exam, Non-Repeating Rotation Service & Modals
│   │   ├── voice-practice/            # Adaptive Voice Practice, BKT & SM-2 integration
│   │   ├── transcript-workspace/      # Live Dictation, Speech Logs, Export & Privacy Settings
│   │   ├── accessibility/             # Vision Mode, Screen Reader & Accessibility Settings
│   │   ├── ai-tutor/                  # Gemini 2.5 Flash AI Syllabus Scribe & Grounded Fallbacks
│   │   ├── revision-planner/          # SuperMemo SM-2 Revision Queue & Scheduling
│   │   ├── progress/                  # Progress Analytics, Topic Mastery & ML Evaluation
│   │   ├── results/                   # Exam Scorecards & Detailed Answer Explanations
│   │   └── pilot-demo/                # 20-Q Balanced Diagnostic Exam & Spoken Acceptance
│   │
│   ├── context/                       # Global React Contexts
│   │   ├── AccessibilityContext.tsx
│   │   └── index.ts
│   │
│   ├── hooks/                         # Shared custom React hooks
│   │   ├── useSpeech.ts
│   │   ├── useKeyboardNavigation.ts
│   │   └── index.ts
│   │
│   ├── services/                      # Shared frontend service layers
│   │   ├── api/                       # Typed fetch client (apiGet, apiPost, apiPut, apiDelete)
│   │   ├── speech/                    # VoiceEngine, NavigationController, CommandParser
│   │   ├── storage/                   # Safe localStorage persistence wrapper
│   │   ├── audio/                     # Auditory earcons & beacons
│   │   ├── mockExamRotationService.ts # Non-repeating mock exam rotation engine
│   │   └── index.ts
│   │
│   ├── lib/                           # Constants, helpers, validators & domain utilities
│   │   ├── constants/                 # Exam durations, subjects, wake-word phrases
│   │   ├── helpers/                   # Repeat question & spoken answer helpers
│   │   ├── validators/                # Grammar, human verification & acceptance validators
│   │   ├── utilities/                 # SSC MTS scoring, BKT, SM-2 & auth voice utilities
│   │   └── index.ts
│   │
│   ├── types/                         # Global & API TypeScript definitions
│   │   ├── global/                    # Domain entities (User, Question, MockExamAttempt, etc.)
│   │   ├── api/                       # REST request/response contracts
│   │   ├── screens.ts                 # Strict 18-screen registry (APPROVED_SCREENS)
│   │   └── index.ts
│   │
│   ├── styles/                        # Modular CSS & WCAG 2.1 AAA theme tokens
│   │   ├── globals.css
│   │   ├── variables.css
│   │   ├── accessibility.css
│   │   └── themes/
│   │       └── themes.css
│   │
│   ├── math/                          # Spoken Mathematical Voice Engine
│   ├── voice/                         # Core VoiceEngine & 10-priority NavigationController
│   ├── data/                          # 400-question SSC MTS bank, ML artifacts & dictionaries
│   ├── db/                            # Dual-persistence repository (PostgreSQL + JSON store)
│   ├── screens/                       # 18 Approved Screen components
│   └── tests/                         # 21 comprehensive automated test suites (236 tests)
│
├── server/                            # Modular Express Backend
│   ├── src/
│   │   ├── config/                    # Environment & database migration state config
│   │   ├── models/                    # Backend domain model exports
│   │   ├── repositories/              # Repository, database pool & migration barrels
│   │   ├── validators/                # Auth & question creation payload validators
│   │   ├── services/                  # AI Tutor & domain calculation services
│   │   ├── controllers/               # Route controllers (Health, Auth, Questions, Practice, Mock, Math, Diagnostic, Revision, Transcript, Model, Tutor)
│   │   ├── routes/                    # Express /api/* router registration
│   │   ├── middleware/                # Multer audio upload & global error middleware
│   │   ├── utils/                     # Password hashing & Python/FFmpeg subprocess runners
│   │   ├── app.ts                     # Express application factory
│   │   └── server.ts                  # Server bootstrapper with Vite/static integration
│   └── tests/
│       └── api.test.ts                # Modular backend verification suite
│
├── data/                              # Dataset, seed & schema accessors
│   ├── questions/
│   ├── seed/
│   └── schemas/
│
├── tests/                             # Categorised test suite entry points
│   ├── unit/
│   ├── integration/
│   ├── accessibility/
│   └── e2e/
│
├── docs/                              # Comprehensive technical documentation
│   ├── architecture/
│   ├── modules/
│   ├── api/
│   ├── database/
│   ├── accessibility/
│   ├── setup/
│   └── deployment/
│
├── scripts/                           # Python ML training, inference & Whisper transcription scripts
├── .env.example                       # Environment variable template
├── server.ts                          # Root backend entry point (delegates to server/src/server.ts)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```
