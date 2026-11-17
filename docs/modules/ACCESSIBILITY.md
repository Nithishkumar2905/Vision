# Accessibility & Voice Navigation Module

## 1. Module Locations
- **Frontend Context**: `src/context/AccessibilityContext.tsx`
- **Voice Engine & Navigation**: `src/voice/VoiceEngine.ts`, `src/voice/NavigationController.ts`, `src/voice/commandParser.ts`, `src/voice/commandRegistry.ts`
- **Feature Package**: `src/features/accessibility/`
- **Screens**: `src/screens/AccessibilitySettingsScreen.tsx`, `src/screens/ScreenReaderSettingsScreen.tsx`
- **Styles**: `src/styles/accessibility.css`, `src/styles/themes/themes.css`

## 2. Key Capabilities
1. **Wake-Word Activation (`"Hey Vision"`)**:
   - Saying `"Hey Vision"` activates the Vision Assistant, announces the current screen, and lists context-sensitive voice commands.
2. **Vision Mode (Screen Curtain / Blind Mode)**:
   - Provides a full-screen high-contrast focus overlay with keyboard-navigable and voice-driven controls for completely non-visual operation.
3. **WCAG 2.1 AAA Visual & Auditory Customisation**:
   - **4 Themes**: Sapphire Default, High-Contrast Yellow on Black, Monochrome Dark, and Soft Dark.
   - **Font Scaling**: 100%, 125%, 150%, 175%, and 200%, plus Dyslexia-friendly hyperlegible typography.
   - **Speech Controls**: Adjustable TTS rate (`0.75x` – `1.5x`), pitch, volume, auto-read toggles, and Chromium TTS freeze-recovery watchdog.
