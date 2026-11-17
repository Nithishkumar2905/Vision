# Transcript Workspace & Learning History Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/transcript-workspace/`
- **Screen**: `src/screens/LearningHistoryScreen.tsx`
- **Backend Controller**: `server/src/controllers/transcript.controller.ts` (`/api/transcripts/*`, `/api/history/*`)

## 2. Key Capabilities
The Transcript Workspace (`learning_history` screen) provides four accessible tabs operable via keyboard or voice:
1. **Overview Audit Log**: Chronological log of all practice sessions, mock examinations, 20-question diagnostics, AI tutor queries, and SM-2 revisions.
2. **Voice Recognition Log**: Searchable, filterable audit trail of recognized and unrecognized voice commands with confidence scores and screen context.
3. **Live Dictation & Recording Workspace**:
   - Supports continuous Web Speech API dictation and MediaRecorder audio capture with server-side OpenAI Whisper transcription (`POST /api/audio/transcribe`).
   - Includes grammar checking (`src/utils/grammarChecker.ts`), audio playback, and one-click export to `.TXT`, `.JSON`, and `.CSV`.
4. **Transcript Privacy Settings**:
   - Allows candidates to toggle transcript storage on/off, configure retention periods (7, 30, 90 days), or permanently purge all stored transcripts (`DELETE /api/transcripts`).
