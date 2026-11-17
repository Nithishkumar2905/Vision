# ACCESSPREP-X — Architecture Refactoring Changelog

## Summary of Architectural Changes

This changelog records all structural, modular, type-safety, and documentation improvements made during the ACCESSPREP-X codebase organisation and architecture refactoring.

---

## 1. TypeScript & Browser Bundle Fixes

| File | Issue Resolved | Resolution |
| :--- | :--- | :--- |
| `src/utils/humanVerification.ts` | Top-level `import crypto from 'crypto'` caused Vite to emit a browser externalization warning (`Module "crypto" has been externalized for browser compatibility`) when imported by `LoginScreen.tsx` and `RegisterScreen.tsx`. | Replaced Node-only `crypto.randomBytes` with a cross-platform `randomHex()` helper using `globalThis.crypto.getRandomValues` (Web Crypto API, supported natively in Node 24 and all modern browsers). |
| `src/components/ScreenNavigationDisclaimer.tsx` | 9 screen components passed uppercase `screenId` strings (e.g., `"DASHBOARD"`, `"MOCK_EXAM"`) causing 11 TypeScript compilation errors and failing runtime `SCREEN_REGISTRY` lookups. | Updated `ScreenNavigationDisclaimerProps` to accept `ScreenId | Uppercase<ScreenId>` and normalized `screenId.toLowerCase()` internally for `SCREEN_REGISTRY` lookups. |
| `src/screens/MockExamScreen.tsx` | State type for `answers` required `markedForReview: boolean`, conflicting with `MockExamAttempt['answers']` where `markedForReview?: boolean` is optional. | Updated `answers` state type to `markedForReview?: boolean`. |
| `src/context/AccessibilityContext.tsx` | Did not re-export `User` type, causing a TypeScript error in `src/tests/transcript_workspace_navigation.test.ts`. | Added `export type { User, AccessibilitySettings }` to `AccessibilityContext.tsx`. |
| `src/voice/NavigationController.ts` | Constructor required `stopSpeak` and `logout` even in unit tests that only test navigation routing. | Made `stopSpeak?: () => void` and `logout?: () => void` optional with safe no-op defaults. |
| `src/voice/commandParser.ts` | `SubjectSelectionResult` union type omitted `'all'` despite returning `subject: 'all'` on line 547. | Added `| 'all'` to `SubjectSelectionResult['subject']`. |

---

## 2. Frontend Modularisation (`src/`)

1. **Application Shell (`src/app/`)**:
   - Created `src/app/App.tsx`, `src/app/main.tsx`, `src/app/layouts/PortalLayout.tsx`, `src/app/providers/AppProviders.tsx`, and `src/app/routes/ScreenRouter.tsx`.
2. **Categorised Shared Components (`src/components/`)**:
   - Organised components into `src/components/common/`, `src/components/ui/`, `src/components/forms/`, `src/components/feedback/`, `src/components/navigation/`, and `src/components/accessibility/` while preserving original component paths.
3. **Feature Modules (`src/features/`)**:
   - Created 11 self-contained feature packages (`authentication`, `dashboard`, `mock-exam`, `voice-practice`, `transcript-workspace`, `accessibility`, `ai-tutor`, `revision-planner`, `progress`, `results`, `pilot-demo`) with dedicated `components/`, `hooks/`, `services/`, `types/`, and `screens/` subdirectories.
4. **Shared Types, Hooks, Services, Lib & Styles**:
   - Created `src/types/global/domain.types.ts`, `src/types/api/api.types.ts`, and `src/types/index.ts`.
   - Created `src/hooks/useSpeech.ts`, `src/hooks/useKeyboardNavigation.ts`, and `src/hooks/index.ts`.
   - Created `src/services/api/apiClient.service.ts`, `src/services/speech/speech.service.ts`, `src/services/storage/storage.service.ts`, `src/services/audio/audio.service.ts`, and `src/services/index.ts`.
   - Created `src/lib/constants/exam.constants.ts`, `src/lib/helpers/question.utils.ts`, `src/lib/validators/verification.validator.ts`, `src/lib/utilities/scoring.utils.ts`, and `src/lib/index.ts`.
   - Created `src/styles/variables.css`, `src/styles/themes/themes.css`, `src/styles/accessibility.css`, and `src/styles/globals.css`.

---

## 3. Backend Modularisation (`server/src/` & `server.ts`)

Refactored the monolithic 1,693-line `server.ts` into a layered Express architecture under `server/src/`:
- `server/src/config/env.config.ts` & `server/src/config/database.config.ts`
- `server/src/models/domain.models.ts`
- `server/src/repositories/index.ts`
- `server/src/utils/password.utils.ts` & `server/src/utils/pythonRunner.utils.ts`
- `server/src/validators/auth.validator.ts` & `server/src/validators/question.validator.ts`
- `server/src/middleware/upload.middleware.ts` & `server/src/middleware/error.middleware.ts`
- `server/src/services/tutor.service.ts` & `server/src/services/index.ts`
- `server/src/controllers/` (`health.controller.ts`, `auth.controller.ts`, `questions.controller.ts`, `practice.controller.ts`, `diagnostic.controller.ts`, `revision.controller.ts`, `transcript.controller.ts`, `model.controller.ts`, `tutor.controller.ts`)
- `server/src/routes/api.routes.ts` & `server/src/routes/index.ts`
- `server/src/app.ts` & `server/src/server.ts`
- Root `server.ts` preserved as a clean entry point delegating to `server/src/server.ts`.

---

## 4. Unused / Static Prototype Files Classification

- **`stitch_design/`**: Contains 16 static HTML/PNG UI design reference prototypes. Not imported by runtime code; retained as design documentation archive.
- **`public/assets/aistudio/*.zip`**: Static AI Studio reference archives; retained untouched to avoid deleting user-supplied project archives.
- **`src/utils/grammarChecker.ts` & `src/math/mathAnswerSession.ts`**: Verified active in automated test suites (`integration.test.ts` and `math_step_session.test.ts`); preserved and re-exported in `src/lib/`.
