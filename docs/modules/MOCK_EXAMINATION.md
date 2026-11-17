# Mock Examination Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/mock-exam/`
- **Screen**: `src/screens/MockExamScreen.tsx`
- **Rotation Service**: `src/services/mockExamRotationService.ts`
- **Scoring Utility**: `src/utils/scoring.ts`
- **Backend Controller**: `server/src/controllers/practice.controller.ts` (`/api/mock/*`)

## 2. Key Capabilities
1. **Official SSC MTS Two-Session Pattern**:
   - **Session I** (Numerical & Mathematical Ability + Reasoning Ability): +3 marks for correct, **0 negative marking**.
   - **Session II** (General Awareness + English Language): +3 marks for correct, **-1 mark penalty** for incorrect.
2. **RPwD Compensatory Time**:
   - Standard duration: 90 minutes (5,400s) for 100 questions (or 60s/question).
   - PwD / Scribe compensatory duration: 120 minutes (7,200s) (or 80s/question, granting 20 minutes extra per hour under DoPT guidelines).
3. **Non-Repeating Question Rotation**:
   - `MockExamRotationService` tracks completed question IDs per candidate across attempts within a cycle (`MockExamRotationState` and `MockExamQuestionAssignment`).
   - Guarantees zero repeated questions across consecutive mock exams until the entire 400-question verified pool is completed, at which point the candidate is prompted to start a new cycle (`POST /api/mock/reset-cycle`).
   - Completely isolated from Voice Practice question selection.
