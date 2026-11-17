import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  LogIn,
  Key,
  Mail,
  Headphones,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { useAccessibility } from '../context/AccessibilityContext.tsx';
import { AuthenticationLayout } from '../components/auth/AuthenticationLayout.tsx';
import { AuthenticationCard } from '../components/auth/AuthenticationCard.tsx';
import { AccessibleFormField } from '../components/auth/AccessibleFormField.tsx';
import { VoiceGuidanceControls } from '../components/auth/VoiceGuidanceControls.tsx';
import { AudioCaptchaControls, CaptchaChallengeData } from '../components/auth/AudioCaptchaControls.tsx';
import { AuthenticationErrorMessage } from '../components/auth/AuthenticationErrorMessage.tsx';
import {
  formatCaptchaForSpeech,
  normalizeSpokenEmail,
  normalizeSpokenName,
  spellOutIdentifier,
  validateLoginIdentifier,
  parseAuthVoiceCommand
} from '../utils/authVoiceUtils.ts';
import { extractDigits } from '../utils/humanVerification.ts';
import { parseConfirmationIntent } from '../voice/commandParser.ts';

type LoginVoiceStep =
  | 'idle'
  | 'ask_email'
  | 'confirm_email'
  | 'enter_password'
  | 'verify_captcha'
  | 'confirm_submit';

const LOGIN_INTRO_MESSAGE =
  'Welcome to ACCESSPREP-X Login. This page allows existing students to access their accounts. You can sign in using your registered email address, password and audio verification code. You can use your voice or keyboard to enter your information. Say Read Instructions to hear the login process.';

const LOGIN_GUIDE_MESSAGE =
  'Login Instructions: Step 1, enter your registered email address or SSC Roll Number. Step 2, enter your password securely using your keyboard. Step 3, listen to the four-digit audio verification code by pressing Play Audio CAPTCHA or Alt plus R, and enter or speak the digits. Step 4, activate Sign In to open your dashboard. You can also say Start Voice Login for step-by-step spoken guidance.';

const LOGIN_FIELDS_SUMMARY =
  'The Login form has three required fields: Field 1, Registered Email Address or Roll Number. Field 2, Password with Show or Hide control. Field 3, Four-digit Audio CAPTCHA verification code, followed by the Sign In button and Create Account link.';

export function LoginScreen() {
  const {
    navigateTo,
    loginUser,
    announce,
    speakText,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    isSpeaking,
    isVoiceListening,
    micPermissionStatus,
    startVoiceListening,
    stopVoiceListening,
    registerVoiceHandler
  } = useAccessibility();

  // Form Values (Defaulting to empty or candidate demo when requested; pre-populated for smooth instant testing)
  const [identifier, setIdentifier] = useState('candidate@accessprep.nic.in');
  const [password, setPassword] = useState('candidate123');
  const [captchaInput, setCaptchaInput] = useState('');

  // Field-level & form-level validation errors
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Audio CAPTCHA State
  const [challenge, setChallenge] = useState<CaptchaChallengeData | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verifiedForInput, setVerifiedForInput] = useState<string>('');
  const [isCapturingCaptchaVoice, setIsCapturingCaptchaVoice] = useState(false);

  // Voice-Guided Login Workflow State
  const [voiceStep, setVoiceStep] = useState<LoginVoiceStep>('idle');
  const lastPromptRef = useRef<string>(LOGIN_INTRO_MESSAGE);
  const hasAnnouncedIntroRef = useRef<boolean>(false);

  // Input Refs for Focus Management
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const captchaInputRef = useRef<HTMLInputElement | null>(null);

  // Keep latest state in refs for asynchronous voice handler callbacks
  const voiceStepRef = useRef<LoginVoiceStep>(voiceStep);
  voiceStepRef.current = voiceStep;
  const identifierRef = useRef<string>(identifier);
  identifierRef.current = identifier;
  const passwordRef = useRef<string>(password);
  passwordRef.current = password;
  const captchaInputRefVal = useRef<string>(captchaInput);
  captchaInputRefVal.current = captchaInput;
  const challengeRef = useRef<CaptchaChallengeData | null>(challenge);
  challengeRef.current = challenge;
  const isCapturingCaptchaVoiceRef = useRef<boolean>(isCapturingCaptchaVoice);
  isCapturingCaptchaVoiceRef.current = isCapturingCaptchaVoice;

  const speakAndRecord = useCallback(
    (text: string, onEnd?: () => void) => {
      lastPromptRef.current = text;
      announce(text, 'polite');
      speakText(text, onEnd);
    },
    [announce, speakText]
  );

  // Fetch initial or refreshed Audio CAPTCHA challenge
  const fetchNewChallenge = useCallback(
    async (announceNew = false, readDigitsOnLoad = false): Promise<CaptchaChallengeData | null> => {
      setChallengeLoading(true);
      setCaptchaError(null);
      setVerificationToken(null);
      setVerifiedForInput('');
      setCaptchaInput('');
      try {
        const res = await fetch('/api/auth/challenge');
        if (res.ok) {
          const data = await res.json();
          const newChallenge: CaptchaChallengeData = {
            challengeId: data.challengeId,
            phrase: data.phrase,
            expiresAt: data.expiresAt
          };
          setChallenge(newChallenge);
          challengeRef.current = newChallenge;

          if (readDigitsOnLoad) {
            const spokenDigits = formatCaptchaForSpeech(newChallenge.phrase);
            const msg = `New audio verification code generated: ${spokenDigits} Please say or type these four digits.`;
            speakAndRecord(msg, () => startVoiceListening());
          } else if (announceNew) {
            const spokenDigits = formatCaptchaForSpeech(newChallenge.phrase);
            speakAndRecord(`Audio CAPTCHA refreshed. The new digits are: ${spokenDigits}`);
          }
          return newChallenge;
        } else {
          setCaptchaError('Unable to load audio verification code. Please press Refresh CAPTCHA.');
        }
      } catch {
        setCaptchaError('Network error while loading audio verification code.');
      } finally {
        setChallengeLoading(false);
      }
      return null;
    },
    [speakAndRecord, startVoiceListening]
  );

  // Load CAPTCHA on initial mount & announce Login Introduction once per screen visit
  useEffect(() => {
    fetchNewChallenge(false, false);

    if (!hasAnnouncedIntroRef.current) {
      hasAnnouncedIntroRef.current = true;
      lastPromptRef.current = LOGIN_INTRO_MESSAGE;
    }

    return () => {
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch for microphone permission denial
  useEffect(() => {
    if (micPermissionStatus === 'denied' && (voiceStep !== 'idle' || isCapturingCaptchaVoice)) {
      setVoiceStep('idle');
      setIsCapturingCaptchaVoice(false);
      const msg =
        'Microphone permission was denied. Switched to keyboard input mode. You can complete all fields using your keyboard.';
      setFormError(msg);
      announce(msg, 'assertive');
      speakText(msg);
      emailInputRef.current?.focus();
    } else if (micPermissionStatus === 'unsupported' && (voiceStep !== 'idle' || isCapturingCaptchaVoice)) {
      setVoiceStep('idle');
      setIsCapturingCaptchaVoice(false);
      const msg =
        'Speech recognition is unavailable in this browser. Switched to keyboard input mode.';
      setFormError(msg);
      announce(msg, 'assertive');
      speakText(msg);
      emailInputRef.current?.focus();
    }
  }, [micPermissionStatus, voiceStep, isCapturingCaptchaVoice, announce, speakText]);

  // Read Audio CAPTCHA digits aloud with short pauses ("Five ... Eight ... Three ... Two.")
  const handlePlayCaptchaAudio = useCallback(() => {
    const cur = challengeRef.current;
    if (!cur) {
      fetchNewChallenge(true, false);
      return;
    }
    const spokenDigits = formatCaptchaForSpeech(cur.phrase);
    const msg = `Audio verification code: ${spokenDigits} Enter or speak these four digits.`;
    speakAndRecord(msg);
  }, [fetchNewChallenge, speakAndRecord]);

  // Verify CAPTCHA response against backend `/api/auth/verify-challenge`
  const verifyCaptchaCode = useCallback(
    async (rawInput: string, inGuidedFlow = false): Promise<string | null> => {
      const curChallenge = challengeRef.current;
      if (!curChallenge) {
        const msg = 'Audio verification code is not loaded yet. Generating a new code now.';
        setCaptchaError(msg);
        await fetchNewChallenge(true, inGuidedFlow);
        return null;
      }

      const cleanDigits = extractDigits(rawInput);
      if (!cleanDigits) {
        const msg = 'Please enter or speak the four digits from the audio verification code.';
        setCaptchaError(msg);
        announce(msg, 'assertive');
        speakText(msg, inGuidedFlow ? () => startVoiceListening() : undefined);
        return null;
      }

      setCaptchaInput(cleanDigits);
      captchaInputRefVal.current = cleanDigits;

      // Reuse already-verified token if input hasn't changed for this challenge
      if (verificationToken && verifiedForInput === `${curChallenge.challengeId}:${cleanDigits}`) {
        return verificationToken;
      }

      try {
        const res = await fetch('/api/auth/verify-challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: curChallenge.challengeId,
            candidatePhrase: cleanDigits
          })
        });

        const data = await res.json();
        if (!res.ok || !data.success || !data.verificationToken) {
          setVerificationToken(null);
          setVerifiedForInput('');
          const errMsg =
            'Audio verification code did not match. Generating a fresh code for you.';
          setCaptchaError(errMsg);
          announce(errMsg, 'assertive');

          // Regenerate CAPTCHA per Section 7 and read new code if in guided flow
          const refreshed = await fetchNewChallenge(false, false);
          if (refreshed) {
            const newSpoken = formatCaptchaForSpeech(refreshed.phrase);
            const retryPrompt = inGuidedFlow
              ? `${errMsg} Your new verification digits are: ${newSpoken} Please repeat the new digits now.`
              : `${errMsg} Press Play Audio CAPTCHA to hear the new code: ${newSpoken}`;
            speakAndRecord(retryPrompt, inGuidedFlow ? () => startVoiceListening() : undefined);
          }
          return null;
        }

        setCaptchaError(null);
        setVerificationToken(data.verificationToken);
        setVerifiedForInput(`${curChallenge.challengeId}:${cleanDigits}`);
        return data.verificationToken;
      } catch {
        const netErr = 'Network failure while verifying audio code. Please check your connection and try again.';
        setCaptchaError(netErr);
        announce(netErr, 'assertive');
        speakText(netErr);
        return null;
      }
    },
    [
      verificationToken,
      verifiedForInput,
      fetchNewChallenge,
      announce,
      speakText,
      speakAndRecord,
      startVoiceListening
    ]
  );

  // Core authentication submission (used by both manual form submit and Voice Login Step 9)
  const executeSignIn = useCallback(
    async (preVerifiedToken?: string | null) => {
      if (loading) return;
      setFormError(null);
      setIdentifierError(null);
      setPasswordError(null);
      setCaptchaError(null);

      const curId = identifierRef.current.trim();
      const curPwd = passwordRef.current.trim();
      const curCaptcha = captchaInputRefVal.current.trim();

      // 1. Validate Email / Identifier
      const idCheck = validateLoginIdentifier(curId);
      if (!idCheck.valid) {
        const msg = idCheck.error || 'Please enter a valid registered email address.';
        setIdentifierError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        emailInputRef.current?.focus();
        return;
      }

      // 2. Validate Password presence
      if (!curPwd) {
        const msg = 'Please enter your password.';
        setPasswordError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        passwordInputRef.current?.focus();
        return;
      }

      // 3. Validate CAPTCHA presence
      if (!preVerifiedToken && !curCaptcha) {
        const msg = 'Please enter or speak the 4-digit audio verification code.';
        setCaptchaError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        captchaInputRef.current?.focus();
        return;
      }

      setLoading(true);
      announce('Authentication in progress. Verifying your credentials...', 'polite');

      try {
        // Step A: Validate credentials first against `/api/auth/validate-credentials`
        const credRes = await fetch('/api/auth/validate-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: curId,
            password: curPwd
          })
        });

        const credData = await credRes.json();
        if (!credRes.ok || !credData.success) {
          const errMsg = credData.error || 'Incorrect email or password. Please verify your credentials and try again.';
          setFormError(errMsg);
          announce(errMsg, 'assertive');
          speakText(errMsg);
          setLoading(false);
          return;
        }

        // Step B: Verify Audio CAPTCHA if not already verified
        let tokenToUse = preVerifiedToken || verificationToken;
        if (!tokenToUse) {
          tokenToUse = await verifyCaptchaCode(curCaptcha, voiceStepRef.current !== 'idle');
          if (!tokenToUse) {
            setLoading(false);
            return;
          }
        }

        // Step C: Establish session via `/api/auth/login`
        const loginRes = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: curId,
            password: curPwd,
            verificationToken: tokenToUse
          })
        });

        const loginData = await loginRes.json();
        if (!loginRes.ok || !loginData.success) {
          // If token expired or was consumed, refresh CAPTCHA
          await fetchNewChallenge(false, false);
          throw new Error(loginData.error || 'Unable to sign in. Please verify your details and try again.');
        }

        // Step D: Announce success and navigate to Dashboard
        const welcomeMsg = 'Welcome back. You have successfully signed in. Opening your dashboard.';
        setSuccessMessage(welcomeMsg);
        setVoiceStep('idle');
        announce(welcomeMsg, 'assertive');

        loginUser(loginData.user, loginData.settings);
        speakText(welcomeMsg);
        navigateTo('dashboard');
      } catch (err: any) {
        const msg =
          err.message === 'Failed to fetch'
            ? 'Network error: Unable to reach the authentication server. Please check your connection.'
            : err.message || 'Authentication failed. Please try again.';
        setFormError(msg);
        announce(msg, 'assertive');
        speakText(msg);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      verificationToken,
      verifyCaptchaCode,
      fetchNewChallenge,
      loginUser,
      navigateTo,
      announce,
      speakText
    ]
  );

  // Voice-Guided Login Workflow Controls
  const handleStartVoiceLogin = useCallback(() => {
    setFormError(null);
    setIdentifierError(null);
    setPasswordError(null);
    setCaptchaError(null);
    setIsCapturingCaptchaVoice(false);
    setVoiceStep('ask_email');
    voiceStepRef.current = 'ask_email';

    const prompt =
      'Voice-guided login started. Please provide your registered email address and password. Step 1 of 4: Please say your registered email address or candidate roll number clearly.';
    speakAndRecord(prompt, () => {
      startVoiceListening();
    });
  }, [speakAndRecord, startVoiceListening]);

  const handleReadLoginGuide = useCallback(() => {
    speakAndRecord(LOGIN_GUIDE_MESSAGE);
  }, [speakAndRecord]);

  const handleSwitchToKeyboard = useCallback(() => {
    stopSpeaking();
    stopVoiceListening();
    setVoiceStep('idle');
    voiceStepRef.current = 'idle';
    setIsCapturingCaptchaVoice(false);
    const msg = 'Switched to keyboard input mode. Registered email address field is now focused.';
    announce(msg, 'polite');
    speakText(msg);
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 50);
  }, [stopSpeaking, stopVoiceListening, announce, speakText]);

  // Advance from Password Step (Step 5) to Audio CAPTCHA Step (Step 6)
  const advanceFromPasswordToCaptcha = useCallback(async () => {
    if (!passwordRef.current.trim()) {
      const msg = 'Password field is empty. Please type your password using your keyboard and press Enter.';
      setPasswordError(msg);
      speakAndRecord(msg);
      passwordInputRef.current?.focus();
      return;
    }

    setPasswordError(null);
    let curChallenge = challengeRef.current;
    if (!curChallenge) {
      curChallenge = await fetchNewChallenge(false, false);
    }

    setVoiceStep('verify_captcha');
    voiceStepRef.current = 'verify_captcha';

    const spokenDigits = curChallenge ? formatCaptchaForSpeech(curChallenge.phrase) : '';
    const prompt = `Password entered securely. Step 3 of 4: Audio verification code. Listen carefully to the four digits: ${spokenDigits} Please say these four digits now, or type them and press Enter.`;
    speakAndRecord(prompt, () => {
      startVoiceListening();
    });
  }, [fetchNewChallenge, speakAndRecord, startVoiceListening]);

  // Single-field voice capture for CAPTCHA button when not in full guided mode
  const handleStartCaptchaVoiceCapture = useCallback(() => {
    if (!challengeRef.current) return;
    setCaptchaError(null);
    setIsCapturingCaptchaVoice(true);
    isCapturingCaptchaVoiceRef.current = true;
    announce('Listening for the four audio verification digits. Please speak now.', 'polite');
    startVoiceListening();
  }, [announce, startVoiceListening]);

  // Start full audio CAPTCHA flow: reads digits aloud, then begins listening for user response
  const handleStartAudioCaptchaFlow = useCallback(async () => {
    let curChallenge = challengeRef.current;
    if (!curChallenge) {
      curChallenge = await fetchNewChallenge(false, false);
    }
    if (!curChallenge) return;

    setCaptchaError(null);
    setIsCapturingCaptchaVoice(true);
    isCapturingCaptchaVoiceRef.current = true;

    const spokenDigits = formatCaptchaForSpeech(curChallenge.phrase);
    const prompt = `Audio verification code: ${spokenDigits} Please say these four digits now, or type them using your keyboard.`;
    speakAndRecord(prompt, () => {
      startVoiceListening();
    });
  }, [fetchNewChallenge, speakAndRecord, startVoiceListening]);

  // Register context-aware voice handler with AccessibilityContext
  useEffect(() => {
    const unregister = registerVoiceHandler(async (rawTranscript: string) => {
      const cmd = parseAuthVoiceCommand(rawTranscript, 'login');

      // 1. Universal & Shared Page Commands
      if (cmd === 'stop_speaking') {
        stopSpeaking();
        return true;
      }
      if (cmd === 'pause') {
        pauseSpeaking();
        return true;
      }
      if (cmd === 'resume') {
        resumeSpeaking();
        return true;
      }
      if (cmd === 'repeat') {
        speakText(lastPromptRef.current || LOGIN_INTRO_MESSAGE);
        return true;
      }
      if (cmd === 'explain_page' || cmd === 'what_can_i_do' || cmd === 'help') {
        const helpMsg =
          'You are on the ACCESSPREP-X Login page. You can sign in with your registered email address, password, and four-digit audio verification code. Available voice commands: Start Voice Login, Read Instructions, Read All Fields, Repeat CAPTCHA, Refresh CAPTCHA, Use Keyboard, or Go to Registration.';
        speakAndRecord(helpMsg, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
        return true;
      }
      if (cmd === 'read_instructions') {
        speakAndRecord(LOGIN_GUIDE_MESSAGE, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
        return true;
      }
      if (cmd === 'read_all_fields') {
        speakAndRecord(LOGIN_FIELDS_SUMMARY, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
        return true;
      }
      if (cmd === 'start_audio_captcha') {
        await handleStartAudioCaptchaFlow();
        return true;
      }
      if (cmd === 'read_captcha') {
        handlePlayCaptchaAudio();
        return true;
      }
      if (cmd === 'refresh_captcha') {
        await fetchNewChallenge(true, voiceStepRef.current === 'verify_captcha');
        return true;
      }
      if (cmd === 'use_keyboard') {
        handleSwitchToKeyboard();
        return true;
      }
      if (cmd === 'use_voice') {
        handleStartVoiceLogin();
        return true;
      }
      if (cmd === 'go_to_register') {
        stopSpeaking();
        navigateTo('register');
        return true;
      }
      if (cmd === 'go_to_login') {
        speakAndRecord('You are already on the Login page.');
        return true;
      }

      // 2. Standalone CAPTCHA voice button capture
      if (isCapturingCaptchaVoiceRef.current && voiceStepRef.current === 'idle') {
        setIsCapturingCaptchaVoice(false);
        isCapturingCaptchaVoiceRef.current = false;
        const token = await verifyCaptchaCode(rawTranscript, false);
        if (token) {
          speakAndRecord('Audio verification code matched. You may now press Sign In.');
        }
        return true;
      }

      // 3. Guided Multi-Step Voice Login Workflow
      const step = voiceStepRef.current;
      if (step === 'idle') {
        return false;
      }

      if (step === 'ask_email') {
        const normalized = normalizeSpokenEmail(rawTranscript);
        if (!normalized) {
          speakAndRecord(
            'I could not catch your email address. Please say your registered email address or candidate roll number again.',
            () => startVoiceListening()
          );
          return true;
        }
        setIdentifier(normalized);
        identifierRef.current = normalized;
        setIdentifierError(null);
        setVoiceStep('confirm_email');
        voiceStepRef.current = 'confirm_email';

        const spelledOut = spellOutIdentifier(normalized);
        speakAndRecord(
          `I heard your identifier as ${normalized}. Spelled out: ${spelledOut}. Is this correct? Say Yes to confirm, or No to re-enter.`,
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'confirm_email') {
        const confirmation = parseConfirmationIntent(rawTranscript.toLowerCase());
        if (confirmation === 'yes') {
          const check = validateLoginIdentifier(identifierRef.current);
          if (!check.valid) {
            setVoiceStep('ask_email');
            voiceStepRef.current = 'ask_email';
            speakAndRecord(
              `${check.error} Please say your registered email address or roll number again.`,
              () => startVoiceListening()
            );
            return true;
          }

          setVoiceStep('enter_password');
          voiceStepRef.current = 'enter_password';
          setTimeout(() => {
            passwordInputRef.current?.focus();
          }, 50);

          speakAndRecord(
            'Identifier confirmed. Step 2 of 4: Secure password entry. For your security, passwords are never spoken aloud. The password field is now focused. Please type your password on your keyboard and press Enter when finished, or say Continue after typing.',
            () => startVoiceListening()
          );
          return true;
        }

        if (confirmation === 'no') {
          setVoiceStep('ask_email');
          voiceStepRef.current = 'ask_email';
          speakAndRecord('Let us try again. Please say your registered email address or roll number clearly.', () =>
            startVoiceListening()
          );
          return true;
        }

        speakAndRecord(
          `Please say Yes to confirm ${identifierRef.current}, or say No to re-enter.`,
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'enter_password') {
        const clean = rawTranscript.toLowerCase().trim();
        if (
          clean === 'continue' ||
          clean === 'next' ||
          clean === 'done' ||
          clean === 'password entered' ||
          clean === 'yes'
        ) {
          await advanceFromPasswordToCaptcha();
          return true;
        }
        // Remind user never to speak password aloud
        speakAndRecord(
          'For your protection, please do not speak your password aloud. Type your password in the focused password box and press Enter.',
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'verify_captcha') {
        const token = await verifyCaptchaCode(rawTranscript, true);
        if (token) {
          setVoiceStep('confirm_submit');
          voiceStepRef.current = 'confirm_submit';
          speakAndRecord(
            `Audio verification code confirmed. Step 4 of 4: Ready to sign in as ${identifierRef.current}. Say Yes or Sign In to access your dashboard, or say No to cancel.`,
            () => startVoiceListening()
          );
        }
        return true;
      }

      if (step === 'confirm_submit') {
        const clean = rawTranscript.toLowerCase().trim();
        const confirmation = parseConfirmationIntent(clean);
        if (confirmation === 'yes' || clean === 'sign in' || clean === 'login' || clean === 'submit') {
          await executeSignIn(verificationToken);
          return true;
        }
        if (confirmation === 'no' || clean === 'cancel') {
          setVoiceStep('idle');
          voiceStepRef.current = 'idle';
          speakAndRecord('Voice sign-in cancelled. You can review the form or press Sign In when ready.');
          return true;
        }
        speakAndRecord('Please say Yes or Sign In to complete authentication, or say No to cancel.', () =>
          startVoiceListening()
        );
        return true;
      }

      return false;
    });

    return () => unregister();
  }, [
    registerVoiceHandler,
    stopSpeaking,
    pauseSpeaking,
    resumeSpeaking,
    speakText,
    speakAndRecord,
    startVoiceListening,
    handlePlayCaptchaAudio,
    fetchNewChallenge,
    handleSwitchToKeyboard,
    handleStartVoiceLogin,
    navigateTo,
    verifyCaptchaCode,
    advanceFromPasswordToCaptcha,
    executeSignIn,
    verificationToken
  ]);

  // Keyboard shortcuts on Login page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handlePlayCaptchaAudio();
        return;
      }
      if (
        (e.ctrlKey && (e.code === 'Space' || e.key === ' ')) ||
        (e.altKey && e.key.toLowerCase() === 's')
      ) {
        e.preventDefault();
        handleStartAudioCaptchaFlow();
        return;
      }

      if (!isInput) {
        const k = e.key.toLowerCase();
        if (k === 'v') {
          e.preventDefault();
          handleStartVoiceLogin();
        } else if (k === 'c') {
          e.preventDefault();
          handleStartAudioCaptchaFlow();
        } else if (k === 'r') {
          e.preventDefault();
          fetchNewChallenge(true, voiceStepRef.current === 'verify_captcha');
        } else if (k === 'g') {
          e.preventDefault();
          navigateTo('register');
        } else if (k === 'k') {
          e.preventDefault();
          handleSwitchToKeyboard();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayCaptchaAudio, handleStartCaptchaVoiceCapture, handleStartAudioCaptchaFlow, handleStartVoiceLogin, fetchNewChallenge, navigateTo, handleSwitchToKeyboard]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeSignIn(verificationToken);
  };

  const fillDemoAccount = (role: 'candidate' | 'admin') => {
    setFormError(null);
    setIdentifierError(null);
    setPasswordError(null);
    setCaptchaError(null);

    if (role === 'candidate') {
      setIdentifier('candidate@accessprep.nic.in');
      identifierRef.current = 'candidate@accessprep.nic.in';
      setPassword('candidate123');
      passwordRef.current = 'candidate123';
    } else {
      setIdentifier('evaluator@ssc.gov.in');
      identifierRef.current = 'evaluator@ssc.gov.in';
      setPassword('admin123');
      passwordRef.current = 'admin123';
    }

    // Also pre-fill current CAPTCHA digits for 1-click demo convenience while keeping full verification active
    if (challengeRef.current) {
      const demoDigits = extractDigits(challengeRef.current.phrase);
      setCaptchaInput(demoDigits);
      captchaInputRefVal.current = demoDigits;
    }

    const label = role === 'candidate' ? 'Candidate Demo' : 'Academic Evaluator Admin';
    announce(
      `Loaded ${label} credentials and current verification digits. Activate Sign In to continue.`,
      'polite'
    );
  };

  const voiceStepLabels: Record<LoginVoiceStep, string> = {
    idle: '',
    ask_email: 'Step 1 of 4: Speak your registered email address',
    confirm_email: `Step 1 of 4: Confirm email (${identifier || '...'}) — Say Yes or No`,
    enter_password: 'Step 2 of 4: Type password securely on keyboard & press Enter',
    verify_captcha: 'Step 3 of 4: Speak or type the 4-digit Audio CAPTCHA code',
    confirm_submit: 'Step 4 of 4: Say "Yes" or "Sign In" to submit'
  };

  return (
    <AuthenticationLayout
      screenBadge="SSC MTS 2026 Portal · Screen 2 of 18"
      headline="Your Learning Journey Starts Here."
      supportingDescription="An accessible examination preparation platform designed to help every learner prepare independently, confidently and at their own pace."
      features={[
        {
          icon: <Headphones className="w-5 h-5" />,
          title: 'Audio-first learning',
          description:
            'Complete screen-reader narration, natural spoken mathematics, and hands-free voice command navigation across every module.'
        },
        {
          icon: <ShieldCheck className="w-5 h-5" />,
          title: 'Accessible examination experience',
          description:
            'Persistent non-repeating 400-question mock exam rotation with automatic RPwD Act compensatory time extensions.'
        },
        {
          icon: <Sparkles className="w-5 h-5" />,
          title: 'Personalized preparation',
          description:
            'Adaptive Bayesian Knowledge Tracing and SuperMemo SM-2 revision schedules tailored to your individual mastery.'
        }
      ]}
      leftExtra={
        <div className="pt-2 border-t border-[#D9E1EF] dark:border-slate-700">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[#53627A] dark:text-slate-300 mb-2.5">
            Quick Demo Access (Evaluation Accounts)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => fillDemoAccount('candidate')}
              className="p-3 text-left rounded-xl bg-white dark:bg-slate-800 hover:bg-[#EEF4FF] dark:hover:bg-slate-700 border border-[#D9E1EF] dark:border-slate-600 transition-colors flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-[#6241C8]"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#172033] dark:text-white truncate">
                  Candidate Demo Account
                </p>
                <p className="text-[11px] text-[#1749E8] dark:text-blue-300 font-mono truncate">
                  candidate@accessprep.nic.in
                </p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-[#1749E8] dark:text-blue-400 shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => fillDemoAccount('admin')}
              className="p-3 text-left rounded-xl bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-slate-700 border border-[#D9E1EF] dark:border-slate-600 transition-colors flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#172033] dark:text-white truncate">
                  Reviewer / Admin Demo
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300 font-mono truncate">
                  evaluator@ssc.gov.in
                </p>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            </button>
          </div>
        </div>
      }
    >
      <AuthenticationCard
        title="Welcome Back"
        subtitle="Sign in to continue your preparation journey."
        audioGuideText={LOGIN_GUIDE_MESSAGE}
        audioGuideLabel="Read login guide aloud"
        stepBadge={voiceStep !== 'idle' ? 'Voice Guided' : undefined}
        footerPromptText="Don't have an account?"
        footerActionLabel="Create Account"
        onFooterAction={() => navigateTo('register')}
      >
        {/* Voice Accessibility Controls */}
        <VoiceGuidanceControls
          mode="login"
          isVoiceWorkflowActive={voiceStep !== 'idle'}
          currentStepLabel={voiceStepLabels[voiceStep]}
          isSpeaking={isSpeaking}
          isListening={isVoiceListening || isCapturingCaptchaVoice}
          onStartVoiceWorkflow={handleStartVoiceLogin}
          onReadGuide={handleReadLoginGuide}
          onStopSpeaking={stopSpeaking}
          onSwitchToKeyboard={handleSwitchToKeyboard}
        />

        {/* Form-level Error or Success Alerts */}
        <AuthenticationErrorMessage
          id="login-form-error"
          title="Sign-In Error"
          message={formError}
        />
        <AuthenticationErrorMessage
          id="login-form-success"
          title="Signed In"
          message={successMessage}
          variant="success"
        />

        {/* Login Form */}
        <form onSubmit={handleFormSubmit} noValidate className="space-y-5">
          {/* 1. Registered Email Address */}
          <AccessibleFormField
            id="login-email"
            name="identifier"
            label="Registered Email Address"
            type="email"
            value={identifier}
            onChange={(val) => {
              setIdentifier(val);
              identifierRef.current = val;
              if (identifierError) setIdentifierError(null);
              if (formError) setFormError(null);
            }}
            onBlur={() => {
              if (identifier.trim()) {
                const check = validateLoginIdentifier(identifier);
                setIdentifierError(check.valid ? null : check.error || null);
              }
            }}
            placeholder="student@example.com or SSC-2026-MTS-01"
            hint="Enter your registered email address or official SSC Roll Number."
            error={identifierError}
            required
            autoComplete="username"
            enterKeyHint="next"
            icon={<Mail className="w-4 h-4" />}
            inputRef={emailInputRef}
          />

          {/* 2. Password (with Show/Hide control & Enter key support for Voice Login Step 5) */}
          <AccessibleFormField
            id="login-password"
            name="password"
            label="Password"
            type="password"
            value={password}
            onChange={(val) => {
              setPassword(val);
              passwordRef.current = val;
              if (passwordError) setPasswordError(null);
              if (formError) setFormError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && voiceStep === 'enter_password') {
                e.preventDefault();
                advanceFromPasswordToCaptcha();
              }
            }}
            placeholder="Enter your password"
            hint="Passwords are kept masked and are never spoken aloud."
            error={passwordError}
            required
            autoComplete="current-password"
            enterKeyHint="next"
            icon={<Key className="w-4 h-4" />}
            inputRef={passwordInputRef}
          />

          {/* 3. Audio CAPTCHA */}
          <AudioCaptchaControls
            id="login-captcha-input"
            challenge={challenge}
            loadingChallenge={challengeLoading}
            captchaInput={captchaInput}
            onCaptchaInputChange={(val) => {
              setCaptchaInput(val);
              captchaInputRefVal.current = val;
              if (captchaError) setCaptchaError(null);
            }}
            onPlayAudio={handlePlayCaptchaAudio}
            onRefreshChallenge={() => fetchNewChallenge(true, voiceStep === 'verify_captcha')}
            onStartVoiceCapture={handleStartCaptchaVoiceCapture}
            isCapturingVoice={isCapturingCaptchaVoice || voiceStep === 'verify_captcha'}
            isVerified={
              Boolean(verificationToken) &&
              Boolean(challenge) &&
              verifiedForInput === `${challenge?.challengeId}:${extractDigits(captchaInput)}`
            }
            error={captchaError}
            inputRef={captchaInputRef}
          />

          {/* 4. Sign In Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[52px] py-3.5 px-6 text-base font-extrabold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-xl shadow-md inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#6241C8]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" aria-hidden="true" />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>
      </AuthenticationCard>
    </AuthenticationLayout>
  );
}
