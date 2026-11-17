# Voice Practice Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/voice-practice/`
- **Screen**: `src/screens/VoicePracticeScreen.tsx`
- **Utilities**: `src/utils/answerParser.ts`, `src/utils/repeatQuestionHelper.ts`, `src/utils/bkt.ts`, `src/utils/sm2.ts`
- **Mathematical Voice Engine**: `src/math/*`
- **Backend Controller**: `server/src/controllers/practice.controller.ts` (`POST /api/practice/submit`)

## 2. Key Capabilities
1. **Hands-Free Subject Selection & Practice**:
   - Candidates can select any of the 4 SSC MTS subjects or `"All Subjects"` using spoken commands (e.g., `"Select Reasoning"`, `"Open Math"`, `"Option 1"`).
2. **Spoken Option & Mathematical Answer Evaluation**:
   - Recognizes spoken option letters (`"Option A"`, `"Answer is B"`, `"Choice C"`), spoken option text, and multi-step mathematical expressions (`src/math/mathAnswerSession.ts`).
3. **Immediate Spoken Feedback & Adaptive Progression**:
   - Announces whether the answer is correct or incorrect, reads the full pedagogical explanation, updates Bayesian Knowledge Tracing (`p_known`), and schedules the question in the SuperMemo SM-2 revision queue.
   - Repeat commands (`"Repeat question"`, `"Repeat options"`, `"Repeat option B"`) replay audio without advancing the question index.
