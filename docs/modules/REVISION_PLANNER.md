# Adaptive Revision Planner Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/revision-planner/`
- **Screen**: `src/screens/RevisionPlannerScreen.tsx`
- **Components**: `src/components/revision/` (`ActiveRevisionSession.tsx`, `DailyRevisionBanner.tsx`, `RevisionDailySummary.tsx`, `RevisionHeader.tsx`, `SessionCompletionSummary.tsx`, `SubjectRevisionBreakdown.tsx`, `UpcomingRevisionTable.tsx`)
- **SM-2 Algorithm**: `src/utils/sm2.ts`
- **Backend Controller**: `server/src/controllers/revision.controller.ts` (`/api/revision/*`)

## 2. Key Capabilities
1. **SuperMemo SM-2 Spaced Repetition**:
   - Calculates `easinessFactor` ($EF \ge 1.3$), `intervalDays`, and `repetitions` for every practiced question based on recall quality ($0\text{–}5$).
2. **Voice-Driven Revision Sessions**:
   - Candidates can start their daily revision queue, filter by subject, ask `"What should I revise"`, answer flashcards by voice, and set custom daily revision targets.
