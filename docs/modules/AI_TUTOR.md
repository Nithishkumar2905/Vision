# AI Syllabus Tutor Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/ai-tutor/`
- **Screen**: `src/screens/AiTutorScreen.tsx`
- **Backend Controller & Service**: `server/src/controllers/tutor.controller.ts`, `server/src/services/tutor.service.ts`

## 2. Key Capabilities
1. **Curriculum-Grounded AI Scribe (`POST /api/tutor/chat`)**:
   - Retrieves relevant verified SSC MTS questions from the 400-question bank matching the candidate's selected subject/topic and injects them as grounding context into **Google Gemini 2.5 Flash**.
2. **Screen-Reader-Optimised Explanations**:
   - System instructions enforce plain-text mathematical formulas (e.g., `Speed = Distance / Time`), step-by-step logical derivation, and a concise one-line `"Takeaway Rule"`.
3. **Deterministic Pedagogical Fallback**:
   - When no `GEMINI_API_KEY` is configured or when offline, the backend automatically synthesizes a step-by-step explanation directly from the verified SSC MTS curriculum bank so candidates always receive accurate tutoring.
