# Authentication & Spoken Human Verification Module

## 1. Module Locations
- **Frontend Feature Package**: `src/features/authentication/`
- **Screens**: `src/screens/LoginScreen.tsx`, `src/screens/RegisterScreen.tsx`
- **Components**: `src/components/auth/` (`AccessibleFormField.tsx`, `AudioCaptchaControls.tsx`, `AuthenticationCard.tsx`, `AuthenticationErrorMessage.tsx`, `AuthenticationLayout.tsx`, `VoiceGuidanceControls.tsx`)
- **Voice & Verification Utilities**: `src/utils/authVoiceUtils.ts`, `src/utils/humanVerification.ts`
- **Backend Controller & Validator**: `server/src/controllers/auth.controller.ts`, `server/src/validators/auth.validator.ts`, `server/src/utils/password.utils.ts`

## 2. Key Capabilities
1. **Two-Stage Spoken & Keyboard Authentication**:
   - **Step 1**: Validates candidate Roll Number / Email and Password / PIN (`POST /api/auth/validate-credentials`).
   - **Step 2**: Issues a 4-digit spoken Audio CAPTCHA challenge (`GET /api/auth/challenge`) verified via `POST /api/auth/verify-challenge` before issuing an authenticated session (`POST /api/auth/login`).
2. **Spoken Field Dictation & Normalization**:
   - Normalizes spoken emails (e.g., `"aarav at accessprep dot nic dot in"` → `aarav@accessprep.nic.in`) and spoken digit sequences (`"four two zero nine"` → `4209`).
3. **RPwD Accessibility Onboarding**:
   - Automatically enables High-Contrast Yellow theme, 150% font scale, compensatory time, and Blind Mode when a candidate registers under the `"Visually Impaired"` category.
