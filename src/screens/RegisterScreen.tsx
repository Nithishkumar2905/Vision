import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  UserPlus,
  User as UserIcon,
  Mail,
  Key,
  Sparkles,
  Mic,
  BookOpen,
  Loader2,
  Sliders
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
  validateEmailFormat,
  parseAuthVoiceCommand
} from '../utils/authVoiceUtils.ts';
import { extractDigits } from '../utils/humanVerification.ts';
import { parseConfirmationIntent } from '../voice/commandParser.ts';

type RegisterVoiceStep =
  | 'idle'
  | 'ask_name'
  | 'ask_email'
  | 'confirm_email'
  | 'enter_password'
  | 'confirm_password'
  | 'verify_captcha'
  | 'confirm_submit';

const REGISTER_INTRO_MESSAGE =
  'Welcome to ACCESSPREP-X Registration. This page allows new students to create their accounts. I will guide you through the registration process step by step. You can use voice assistance or keyboard input where supported.';

const REGISTER_GUIDE_MESSAGE =
  'Registration Instructions: Step 1, enter your Full Name. Step 2, enter your Email Address. Step 3, create a secure Password of at least 6 characters using your keyboard. Step 4, confirm your Password. Step 5, select your PwD accessibility accommodations if applicable. Step 6, complete the four-digit Audio CAPTCHA and activate Create Account. Say Start Voice Registration for step-by-step guidance.';

const REGISTER_FIELDS_SUMMARY =
  'The Registration form contains: Field 1, Full Name. Field 2, Email Address. Field 3, Password with Show or Hide control. Field 4, Confirm Password with Show or Hide control. Field 5, PwD Category and Scribe Accommodations. Field 6, Four-digit Audio CAPTCHA verification code, followed by the Create Account button and Sign In link.';

export function RegisterScreen() {
  const {
    navigateTo,
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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    pwdCategory: 'Visually Impaired',
    needScribe: true,
    examRegion: 'Northern Region (NR)',
    examLanguage: 'English',
    password: '',
    confirmPassword: ''
  });

  // Field-level & Form-level Validation Errors
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Audio CAPTCHA State
  const [challenge, setChallenge] = useState<CaptchaChallengeData | null>(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [captchaInput, setCaptchaInput] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verifiedForInput, setVerifiedForInput] = useState<string>('');
  const [isCapturingCaptchaVoice, setIsCapturingCaptchaVoice] = useState(false);

  // Voice-Guided Registration State
  const [voiceStep, setVoiceStep] = useState<RegisterVoiceStep>('idle');
  const lastPromptRef = useRef<string>(REGISTER_INTRO_MESSAGE);
  const hasAnnouncedIntroRef = useRef<boolean>(false);

  // Input Refs for Focus Management
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const captchaInputRef = useRef<HTMLInputElement | null>(null);

  // Live Refs for Asynchronous Voice Callbacks
  const voiceStepRef = useRef<RegisterVoiceStep>(voiceStep);
  voiceStepRef.current = voiceStep;
  const formDataRef = useRef(formData);
  formDataRef.current = formData;
  const challengeRef = useRef<CaptchaChallengeData | null>(challenge);
  challengeRef.current = challenge;
  const captchaInputRefVal = useRef<string>(captchaInput);
  captchaInputRefVal.current = captchaInput;
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

  // Announce Registration Introduction once per screen visit & load CAPTCHA
  useEffect(() => {
    fetchNewChallenge(false, false);

    if (!hasAnnouncedIntroRef.current) {
      hasAnnouncedIntroRef.current = true;
      lastPromptRef.current = REGISTER_INTRO_MESSAGE;
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
        'Microphone permission was denied. Switched to keyboard input mode. You can complete registration using your keyboard.';
      setFormError(msg);
      announce(msg, 'assertive');
      speakText(msg);
      nameInputRef.current?.focus();
    } else if (micPermissionStatus === 'unsupported' && (voiceStep !== 'idle' || isCapturingCaptchaVoice)) {
      setVoiceStep('idle');
      setIsCapturingCaptchaVoice(false);
      const msg =
        'Speech recognition is unavailable in this browser. Switched to keyboard input mode.';
      setFormError(msg);
      announce(msg, 'assertive');
      speakText(msg);
      nameInputRef.current?.focus();
    }
  }, [micPermissionStatus, voiceStep, isCapturingCaptchaVoice, announce, speakText]);

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

  // Verify CAPTCHA response against `/api/auth/verify-challenge`
  const verifyCaptchaCode = useCallback(
    async (rawInput: string, inGuidedFlow = false): Promise<string | null> => {
      const curChallenge = challengeRef.current;
      if (!curChallenge) {
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
        const netErr = 'Network failure while verifying audio code. Please check your connection.';
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

  // Core Registration Submission (used by both manual form submit and Voice Registration Step 9)
  const executeRegistration = useCallback(
    async (preVerifiedToken?: string | null) => {
      if (loading) return;
      setFormError(null);
      setNameError(null);
      setEmailError(null);
      setPasswordError(null);
      setConfirmPasswordError(null);
      setCaptchaError(null);

      const cur = formDataRef.current;
      const curCaptcha = captchaInputRefVal.current.trim();

      // 1. Validate Full Name
      if (!cur.name.trim()) {
        const msg = 'Please enter your full name.';
        setNameError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        nameInputRef.current?.focus();
        return;
      }

      // 2. Validate Email Address
      if (!cur.email.trim() || !validateEmailFormat(cur.email.trim())) {
        const msg = 'Please enter a valid email address (for example, student@example.com).';
        setEmailError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        emailInputRef.current?.focus();
        return;
      }

      // 3. Validate Password
      if (!cur.password || cur.password.length < 6) {
        const msg = 'Please enter a password of at least 6 characters.';
        setPasswordError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        passwordInputRef.current?.focus();
        return;
      }

      // 4. Validate Confirm Password
      if (cur.password !== cur.confirmPassword) {
        const msg = 'Passwords do not match. Please ensure both password fields match.';
        setConfirmPasswordError(msg);
        announce(msg, 'assertive');
        speakText(msg);
        confirmPasswordInputRef.current?.focus();
        return;
      }

      // 5. Validate Audio CAPTCHA
      let tokenToUse = preVerifiedToken || verificationToken;
      if (!tokenToUse) {
        if (!curCaptcha) {
          const msg = 'Please enter or speak the 4-digit audio verification code.';
          setCaptchaError(msg);
          announce(msg, 'assertive');
          speakText(msg);
          captchaInputRef.current?.focus();
          return;
        }
        tokenToUse = await verifyCaptchaCode(curCaptcha, voiceStepRef.current !== 'idle');
        if (!tokenToUse) {
          return;
        }
      }

      setLoading(true);
      announce('Creating your ACCESSPREP-X account...', 'polite');

      try {
        const isBlind = cur.pwdCategory === 'Visually Impaired' || Boolean(cur.needScribe);
        const payload = {
          name: cur.name.trim(),
          email: cur.email.trim(),
          phone: cur.phone.trim(),
          pwdCategory: cur.pwdCategory,
          needScribe: cur.needScribe,
          examRegion: cur.examRegion,
          examLanguage: cur.examLanguage,
          password: cur.password,
          isBlindMode: isBlind,
          autoReadAloud: isBlind
        };

        if (isBlind) {
          try {
            localStorage.setItem('accessprep_blind_mode', 'true');
          } catch {}
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Registration failed. Please verify your information.');
        }

        const rollNumber: string = data.user?.rollNumber || '';
        const welcomeText = `Your ACCESSPREP-X account has been created successfully. Welcome!${
          rollNumber ? ` Your Roll Number is ${rollNumber}.` : ''
        } Redirecting to Sign In.`;

        setSuccessMsg(welcomeText);
        setVoiceStep('idle');
        announce(welcomeText, 'assertive');
        speakText(welcomeText);

        setTimeout(() => {
          navigateTo('login');
        }, 2200);
      } catch (err: any) {
        const msg =
          err.message === 'Failed to fetch'
            ? 'Network failure: Unable to reach the registration server. Please check your connection.'
            : err.message || 'Registration failed.';
        setFormError(msg);
        announce(msg, 'assertive');
        speakText(msg);
      } finally {
        setLoading(false);
      }
    },
    [loading, verificationToken, verifyCaptchaCode, announce, speakText, navigateTo]
  );

  // Voice-Guided Registration Workflow Controls
  const handleStartVoiceRegistration = useCallback(() => {
    setFormError(null);
    setNameError(null);
    setEmailError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);
    setCaptchaError(null);
    setIsCapturingCaptchaVoice(false);
    setVoiceStep('ask_name');
    voiceStepRef.current = 'ask_name';

    const prompt =
      'Voice-guided registration started. Step 1 of 6: Please say your full name clearly.';
    speakAndRecord(prompt, () => {
      startVoiceListening();
    });
  }, [speakAndRecord, startVoiceListening]);

  const handleReadRegistrationGuide = useCallback(() => {
    speakAndRecord(REGISTER_GUIDE_MESSAGE);
  }, [speakAndRecord]);

  const handleSwitchToKeyboard = useCallback(() => {
    stopSpeaking();
    stopVoiceListening();
    setVoiceStep('idle');
    voiceStepRef.current = 'idle';
    setIsCapturingCaptchaVoice(false);
    const msg = 'Switched to keyboard input mode. Full Name field is now focused.';
    announce(msg, 'polite');
    speakText(msg);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 50);
  }, [stopSpeaking, stopVoiceListening, announce, speakText]);

  // Step 5 -> Step 6 transition (Password -> Confirm Password)
  const advanceFromPasswordToConfirm = useCallback(() => {
    const pwd = formDataRef.current.password;
    if (!pwd || pwd.length < 6) {
      const msg = 'Please enter a password of at least 6 characters using your keyboard and press Enter.';
      setPasswordError(msg);
      speakAndRecord(msg);
      passwordInputRef.current?.focus();
      return;
    }

    setPasswordError(null);
    setVoiceStep('confirm_password');
    voiceStepRef.current = 'confirm_password';
    setTimeout(() => {
      confirmPasswordInputRef.current?.focus();
    }, 50);

    speakAndRecord(
      'Password entered. Step 4 of 6: Confirm your password. The confirm password field is now focused. Please type the same password again on your keyboard and press Enter.',
      () => startVoiceListening()
    );
  }, [speakAndRecord, startVoiceListening]);

  // Step 6 -> Step 7 transition (Confirm Password -> Audio CAPTCHA)
  const advanceFromConfirmToCaptcha = useCallback(async () => {
    const { password, confirmPassword } = formDataRef.current;
    if (!confirmPassword || password !== confirmPassword) {
      const msg = 'Passwords do not match. Please type the matching confirmation password and press Enter.';
      setConfirmPasswordError(msg);
      speakAndRecord(msg);
      confirmPasswordInputRef.current?.focus();
      return;
    }

    setConfirmPasswordError(null);
    let curChallenge = challengeRef.current;
    if (!curChallenge) {
      curChallenge = await fetchNewChallenge(false, false);
    }

    setVoiceStep('verify_captcha');
    voiceStepRef.current = 'verify_captcha';

    const spokenDigits = curChallenge ? formatCaptchaForSpeech(curChallenge.phrase) : '';
    const prompt = `Password confirmed. Step 5 of 6: Audio verification code. Listen carefully to the four digits: ${spokenDigits} Please say these four digits now, or type them and press Enter.`;
    speakAndRecord(prompt, () => startVoiceListening());
  }, [fetchNewChallenge, speakAndRecord, startVoiceListening]);

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

  // Register context-aware voice handler for Registration
  useEffect(() => {
    const unregister = registerVoiceHandler(async (rawTranscript: string) => {
      const cmd = parseAuthVoiceCommand(rawTranscript, 'register');

      // 1. Shared Page Commands
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
        speakText(lastPromptRef.current || REGISTER_INTRO_MESSAGE);
        return true;
      }
      if (cmd === 'explain_page' || cmd === 'what_can_i_do' || cmd === 'help') {
        const helpMsg =
          'You are on the ACCESSPREP-X Registration page. You can create a new student account using your full name, email address, password, accessibility preferences, and audio verification code. Available voice commands: Start Voice Registration, Read Instructions, Read All Fields, Repeat CAPTCHA, Refresh CAPTCHA, Use Keyboard, or Go to Login.';
        speakAndRecord(helpMsg, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
        return true;
      }
      if (cmd === 'read_instructions') {
        speakAndRecord(REGISTER_GUIDE_MESSAGE, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
        return true;
      }
      if (cmd === 'read_all_fields') {
        speakAndRecord(REGISTER_FIELDS_SUMMARY, voiceStepRef.current !== 'idle' ? () => startVoiceListening() : undefined);
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
        handleStartVoiceRegistration();
        return true;
      }
      if (cmd === 'go_to_login') {
        stopSpeaking();
        navigateTo('login');
        return true;
      }
      if (cmd === 'go_to_register') {
        speakAndRecord('You are already on the Registration page.');
        return true;
      }

      // 2. Standalone CAPTCHA voice button capture
      if (isCapturingCaptchaVoiceRef.current && voiceStepRef.current === 'idle') {
        setIsCapturingCaptchaVoice(false);
        isCapturingCaptchaVoiceRef.current = false;
        const token = await verifyCaptchaCode(rawTranscript, false);
        if (token) {
          speakAndRecord('Audio verification code matched. You may now press Create Account.');
        }
        return true;
      }

      // 3. Guided Multi-Step Voice Registration Workflow
      const step = voiceStepRef.current;
      if (step === 'idle') {
        return false;
      }

      if (step === 'ask_name') {
        const cleanedName = rawTranscript
          .replace(/^(my name is|my full name is|name is|i am)\s+/i, '')
          .replace(/[^\w\s.\-']/g, '')
          .trim();

        if (!cleanedName || cleanedName.length < 2) {
          speakAndRecord('Please say your full name clearly.', () => startVoiceListening());
          return true;
        }

        const updated = { ...formDataRef.current, name: cleanedName };
        setFormData(updated);
        formDataRef.current = updated;
        setNameError(null);
        setVoiceStep('ask_email');
        voiceStepRef.current = 'ask_email';

        speakAndRecord(
          `Full name recorded as ${cleanedName}. Step 2 of 6: Please say your email address.`,
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'ask_email') {
        const normalizedEmail = normalizeSpokenEmail(rawTranscript);
        if (!normalizedEmail) {
          speakAndRecord(
            'I could not catch your email address. Please say your email address clearly, for example aarav at example dot com.',
            () => startVoiceListening()
          );
          return true;
        }

        const updated = { ...formDataRef.current, email: normalizedEmail };
        setFormData(updated);
        formDataRef.current = updated;
        setEmailError(null);
        setVoiceStep('confirm_email');
        voiceStepRef.current = 'confirm_email';

        speakAndRecord(
          `I heard ${normalizedEmail}. Is this correct? Say Yes to confirm, or No to repeat your email address.`,
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'confirm_email') {
        const confirmation = parseConfirmationIntent(rawTranscript.toLowerCase());
        if (confirmation === 'yes') {
          if (!validateEmailFormat(formDataRef.current.email)) {
            setVoiceStep('ask_email');
            voiceStepRef.current = 'ask_email';
            speakAndRecord(
              'That email format is incomplete. Please say your full email address again, including at and dot com.',
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
            'Email confirmed. Step 3 of 6: Create a password. For your security, passwords are never spoken aloud. The password field is now focused. Please type a password of at least 6 characters on your keyboard and press Enter.',
            () => startVoiceListening()
          );
          return true;
        }

        if (confirmation === 'no') {
          setVoiceStep('ask_email');
          voiceStepRef.current = 'ask_email';
          speakAndRecord('Let us try again. Please say your email address clearly.', () =>
            startVoiceListening()
          );
          return true;
        }

        speakAndRecord(
          `Please say Yes to confirm ${formDataRef.current.email}, or say No to repeat your email address.`,
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'enter_password') {
        const clean = rawTranscript.toLowerCase().trim();
        if (clean === 'continue' || clean === 'next' || clean === 'done' || clean === 'yes') {
          advanceFromPasswordToConfirm();
          return true;
        }
        speakAndRecord(
          'For your protection, please do not speak your password aloud. Type your password in the focused password field and press Enter.',
          () => startVoiceListening()
        );
        return true;
      }

      if (step === 'confirm_password') {
        const clean = rawTranscript.toLowerCase().trim();
        if (clean === 'continue' || clean === 'next' || clean === 'done' || clean === 'yes') {
          await advanceFromConfirmToCaptcha();
          return true;
        }
        speakAndRecord(
          'Please type your confirmation password using your keyboard and press Enter.',
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
            `Audio verification code confirmed. Step 6 of 6: Ready to create your ACCESSPREP-X account for ${formDataRef.current.name} with email ${formDataRef.current.email}. Say Yes or Create Account to complete registration, or say No to cancel.`,
            () => startVoiceListening()
          );
        }
        return true;
      }

      if (step === 'confirm_submit') {
        const clean = rawTranscript.toLowerCase().trim();
        const confirmation = parseConfirmationIntent(clean);
        if (
          confirmation === 'yes' ||
          clean === 'create account' ||
          clean === 'register' ||
          clean === 'submit'
        ) {
          await executeRegistration(verificationToken);
          return true;
        }
        if (confirmation === 'no' || clean === 'cancel') {
          setVoiceStep('idle');
          voiceStepRef.current = 'idle';
          speakAndRecord(
            'Voice registration paused. You can review your details or press Create Account when ready.'
          );
          return true;
        }
        speakAndRecord(
          'Please say Yes or Create Account to complete registration, or say No to cancel.',
          () => startVoiceListening()
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
    handleStartVoiceRegistration,
    navigateTo,
    verifyCaptchaCode,
    advanceFromPasswordToConfirm,
    advanceFromConfirmToCaptcha,
    executeRegistration,
    verificationToken
  ]);

  // Global keyboard shortcuts on Register page (Alt+R to Play CAPTCHA, Ctrl+Space / Alt+S to Speak CAPTCHA)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        handleStartCaptchaVoiceCapture();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayCaptchaAudio, handleStartCaptchaVoiceCapture]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeRegistration(verificationToken);
  };

  const voiceStepLabels: Record<RegisterVoiceStep, string> = {
    idle: '',
    ask_name: 'Step 1 of 6: Speak your Full Name',
    ask_email: 'Step 2 of 6: Speak your Email Address',
    confirm_email: `Step 2 of 6: Confirm email (${formData.email || '...'}) — Say Yes or No`,
    enter_password: 'Step 3 of 6: Type password securely on keyboard & press Enter',
    confirm_password: 'Step 4 of 6: Type confirm password on keyboard & press Enter',
    verify_captcha: 'Step 5 of 6: Speak or type the 4-digit Audio CAPTCHA code',
    confirm_submit: 'Step 6 of 6: Say "Yes" or "Create Account" to submit'
  };

  return (
    <AuthenticationLayout
      screenBadge="SSC MTS 2026 Portal · Screen 3 of 18"
      headline="Begin Your Journey with ACCESSPREP-X."
      supportingDescription="Create your account and experience a more accessible way to learn, practise and prepare for your examinations."
      features={[
        {
          icon: <Sparkles className="w-5 h-5" />,
          title: 'Personalized learning',
          description:
            'Adaptive Bayesian Knowledge Tracing calibrates practice questions and SM-2 flashcards to your individual learning curve.'
        },
        {
          icon: <Mic className="w-5 h-5" />,
          title: 'Accessible voice interaction',
          description:
            'Hands-free voice navigation, spoken question and option narration, and natural spoken mathematical expression evaluation.'
        },
        {
          icon: <BookOpen className="w-5 h-5" />,
          title: 'Independent examination preparation',
          description:
            'Full SSC MTS syllabus coverage with non-repeating mock exam sets and automatic RPwD compensatory time configuration.'
        }
      ]}
    >
      <AuthenticationCard
        title="Create Your Account"
        subtitle="Join ACCESSPREP-X and start preparing with confidence."
        audioGuideText={REGISTER_GUIDE_MESSAGE}
        audioGuideLabel="Read registration guide aloud"
        stepBadge={voiceStep !== 'idle' ? 'Voice Guided' : undefined}
        footerPromptText="Already have an account?"
        footerActionLabel="Sign In"
        onFooterAction={() => navigateTo('login')}
      >
        {/* Voice Accessibility Controls */}
        <VoiceGuidanceControls
          mode="register"
          isVoiceWorkflowActive={voiceStep !== 'idle'}
          currentStepLabel={voiceStepLabels[voiceStep]}
          isSpeaking={isSpeaking}
          isListening={isVoiceListening || isCapturingCaptchaVoice}
          onStartVoiceWorkflow={handleStartVoiceRegistration}
          onReadGuide={handleReadRegistrationGuide}
          onStopSpeaking={stopSpeaking}
          onSwitchToKeyboard={handleSwitchToKeyboard}
        />

        {/* Error & Success Messages */}
        <AuthenticationErrorMessage
          id="register-form-error"
          title="Registration Notice"
          message={formError}
        />
        <AuthenticationErrorMessage
          id="register-form-success"
          title="Account Created Successfully"
          message={successMsg}
          variant="success"
        />

        {/* Registration Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* 1. Full Name */}
          <AccessibleFormField
            id="register-name"
            name="name"
            label="Full Name"
            type="text"
            value={formData.name}
            onChange={(val) => {
              const updated = { ...formData, name: val };
              setFormData(updated);
              formDataRef.current = updated;
              if (nameError) setNameError(null);
              if (formError) setFormError(null);
            }}
            onBlur={() => {
              if (!formData.name.trim()) {
                setNameError('Please enter your full name.');
              }
            }}
            placeholder="e.g. Aarav Sharma"
            hint="Enter your full name as it appears on your examination records."
            error={nameError}
            required
            autoComplete="name"
            enterKeyHint="next"
            icon={<UserIcon className="w-4 h-4" />}
            inputRef={nameInputRef}
          />

          {/* 2. Email Address */}
          <AccessibleFormField
            id="register-email"
            name="email"
            label="Email Address"
            type="email"
            value={formData.email}
            onChange={(val) => {
              const updated = { ...formData, email: val };
              setFormData(updated);
              formDataRef.current = updated;
              if (emailError) setEmailError(null);
              if (formError) setFormError(null);
            }}
            onBlur={() => {
              if (formData.email.trim() && !validateEmailFormat(formData.email.trim())) {
                setEmailError('Please enter a valid email address (for example, student@example.com).');
              }
            }}
            placeholder="e.g. candidate@example.com"
            hint="Used for signing in and receiving your candidate Roll Number."
            error={emailError}
            required
            autoComplete="email"
            enterKeyHint="next"
            icon={<Mail className="w-4 h-4" />}
            inputRef={emailInputRef}
          />

          {/* 3. Password & 4. Confirm Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <AccessibleFormField
              id="register-password"
              name="password"
              label="Password"
              type="password"
              value={formData.password}
              onChange={(val) => {
                const updated = { ...formData, password: val };
                setFormData(updated);
                formDataRef.current = updated;
                if (passwordError) setPasswordError(null);
                if (formError) setFormError(null);
              }}
              onBlur={() => {
                if (formData.password && formData.password.length < 6) {
                  setPasswordError('Password must be at least 6 characters.');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && voiceStep === 'enter_password') {
                  e.preventDefault();
                  advanceFromPasswordToConfirm();
                }
              }}
              placeholder="Min. 6 characters"
              hint="Minimum 6 characters. Never spoken aloud."
              error={passwordError}
              required
              autoComplete="new-password"
              enterKeyHint="next"
              icon={<Key className="w-4 h-4" />}
              inputRef={passwordInputRef}
            />

            <AccessibleFormField
              id="register-confirm-password"
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              value={formData.confirmPassword}
              onChange={(val) => {
                const updated = { ...formData, confirmPassword: val };
                setFormData(updated);
                formDataRef.current = updated;
                if (confirmPasswordError) setConfirmPasswordError(null);
                if (formError) setFormError(null);
              }}
              onBlur={() => {
                if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
                  setConfirmPasswordError('Passwords do not match.');
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && voiceStep === 'confirm_password') {
                  e.preventDefault();
                  advanceFromConfirmToCaptcha();
                }
              }}
              placeholder="Re-enter password"
              hint="Re-enter the same password to confirm."
              error={confirmPasswordError}
              required
              autoComplete="new-password"
              enterKeyHint="next"
              icon={<Key className="w-4 h-4" />}
              inputRef={confirmPasswordInputRef}
            />
          </div>

          {/* 5. Assistive & PwD Accommodations (Preserved from existing registration backend) */}
          <fieldset className="p-4 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border-2 border-[#D9E1EF] dark:border-slate-700 space-y-3.5">
            <legend className="px-2 text-xs font-extrabold uppercase tracking-wider text-[#1749E8] dark:text-blue-300 inline-flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Accessibility &amp; PwD Accommodations</span>
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="register-pwd-category"
                  className="block text-xs font-bold text-[#172033] dark:text-slate-200 mb-1"
                >
                  Disability Category (RPwD Act)
                </label>
                <select
                  id="register-pwd-category"
                  name="pwdCategory"
                  value={formData.pwdCategory}
                  onChange={(e) => {
                    const updated = { ...formData, pwdCategory: e.target.value };
                    setFormData(updated);
                    formDataRef.current = updated;
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border-2 border-[#D9E1EF] dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-[#172033] dark:text-white font-medium focus:border-[#1749E8] focus:outline-none focus:ring-2 focus:ring-[#6241C8]"
                >
                  <option value="Visually Impaired">Visually Impaired (Blindness)</option>
                  <option value="Low Vision">Low Vision (Partial Sight)</option>
                  <option value="Locomotor">Locomotor / Cerebral Palsy</option>
                  <option value="None">None (General Candidate)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="register-exam-region"
                  className="block text-xs font-bold text-[#172033] dark:text-slate-200 mb-1"
                >
                  Examination Region
                </label>
                <select
                  id="register-exam-region"
                  name="examRegion"
                  value={formData.examRegion}
                  onChange={(e) => {
                    const updated = { ...formData, examRegion: e.target.value };
                    setFormData(updated);
                    formDataRef.current = updated;
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-sm border-2 border-[#D9E1EF] dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-[#172033] dark:text-white font-medium focus:border-[#1749E8] focus:outline-none focus:ring-2 focus:ring-[#6241C8]"
                >
                  <option value="Northern Region (NR)">Northern Region (NR)</option>
                  <option value="Central Region (CR)">Central Region (CR)</option>
                  <option value="Eastern Region (ER)">Eastern Region (ER)</option>
                  <option value="Western Region (WR)">Western Region (WR)</option>
                  <option value="Southern Region (SR)">Southern Region (SR)</option>
                </select>
              </div>
            </div>

            <label
              htmlFor="register-need-scribe"
              className="flex items-start gap-3 p-3 rounded-xl bg-white dark:bg-slate-900 border border-[#D9E1EF] dark:border-slate-600 cursor-pointer"
            >
              <input
                id="register-need-scribe"
                name="needScribe"
                type="checkbox"
                checked={formData.needScribe}
                onChange={(e) => {
                  const updated = { ...formData, needScribe: e.target.checked };
                  setFormData(updated);
                  formDataRef.current = updated;
                }}
                className="w-5 h-5 mt-0.5 rounded text-[#1749E8] accent-[#1749E8] border-2 border-slate-400 focus:ring-2 focus:ring-[#1749E8]"
              />
              <span className="text-xs text-[#53627A] dark:text-slate-300 leading-relaxed">
                <strong className="font-bold text-[#172033] dark:text-white block">
                  Enable Scribe &amp; Compensatory Time (20 min/hour)
                </strong>
                Allocates 60 minutes per 45-minute examination session and enables Voice-First Blind Mode defaults.
              </span>
            </label>
          </fieldset>

          {/* 6. Audio CAPTCHA */}
          <AudioCaptchaControls
            id="register-captcha-input"
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

          {/* 7. Create Account Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[52px] py-3.5 px-6 text-base font-extrabold text-white bg-gradient-to-r from-[#1749E8] to-[#6241C8] hover:from-[#123BB8] hover:to-[#4C2FA8] rounded-xl shadow-md inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#6241C8]"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" aria-hidden="true" />
                <span>Create Account</span>
              </>
            )}
          </button>
        </form>
      </AuthenticationCard>
    </AuthenticationLayout>
  );
}
