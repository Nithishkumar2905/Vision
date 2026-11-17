# Troubleshooting Guide

## 1. Microphone / Speech Recognition Not Starting
- **Cause**: Browser Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`) requires microphone permission in Chromium-based browsers (Chrome, Edge, Brave).
- **Resolution**: Grant microphone access in the browser address bar, or use the keyboard input / push-to-talk fallback controls available on every screen.

## 2. Text-to-Speech (TTS) Stops Mid-Sentence in Chrome
- **Cause**: Chromium's `window.speechSynthesis` has a known 15-second pause bug on long utterances.
- **Resolution**: `AccessibilityContext.tsx` includes an automatic keep-alive watchdog and utterance chunking. Press `Escape` or say `"Stop"` followed by `"Repeat"` to reset speech synthesis immediately.

## 3. PostgreSQL Connection Refused on Startup
- **Behavior**: You will see `[Database Engine]: PostgreSQL not reachable. Operating on validated File JSON Store.`
- **Resolution**: No action is required for local development or testing—the platform automatically uses `src/data/app_database.json`.
