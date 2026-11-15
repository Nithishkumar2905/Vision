/**
 * ACCESSPREP-X — Authentication Voice & Validation Utilities
 * ============================================================================
 * Pure utility functions for spoken email normalization, digit-by-digit
 * Audio CAPTCHA speech formatting, context-aware voice command detection,
 * and accessible credential validation.
 */

import { extractDigits } from './humanVerification.ts';

const DIGIT_SPOKEN_WORD: Record<string, string> = {
  '0': 'Zero',
  '1': 'One',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine'
};

const SPOKEN_NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9'
};

/**
 * Phonetic dictionary mapping speech-recognition distortions to correctly
 * spelled Indian proper names and surnames.
 */
export const PHONETIC_NAME_MAP: Record<string, string> = {
  'ash wind': 'Ashwin',
  'ash win': 'Ashwin',
  'aswin': 'Ashwin',
  'ashwan': 'Ashwin',
  'ashwinn': 'Ashwin',
  'ash wine': 'Ashwin',
  'ash wing': 'Ashwin',
  'as win': 'Ashwin',
  'ashwin': 'Ashwin',
  'ra vee': 'Ravi',
  'robbie': 'Ravi',
  'ravii': 'Ravi',
  'ravi': 'Ravi',
  'pree ya': 'Priya',
  'preya': 'Priya',
  'priya': 'Priya',
  'rah ul': 'Rahul',
  'raahul': 'Rahul',
  'rahul': 'Rahul',
  'am it': 'Amit',
  'ahmit': 'Amit',
  'amit': 'Amit',
  'soo raj': 'Suraj',
  'su raj': 'Suraj',
  'suraj': 'Suraj',
  'san jay': 'Sanjay',
  'sun jay': 'Sanjay',
  'sanjay': 'Sanjay',
  'an kit': 'Ankit',
  'ankit': 'Ankit',
  'ad it ya': 'Aditya',
  'aditya': 'Aditya',
  'ar jun': 'Arjun',
  'arjun': 'Arjun',
  'ro hit': 'Rohit',
  'rohit': 'Rohit',
  'ni tin': 'Nitin',
  'nitin': 'Nitin',
  'ka vya': 'Kavya',
  'kavya': 'Kavya',
  'poo ja': 'Pooja',
  'puja': 'Pooja',
  'pooja': 'Pooja',
  'di vya': 'Divya',
  'divya': 'Divya',
  'mee na': 'Meena',
  'meena': 'Meena',
  'vi nay': 'Vinay',
  'vinay': 'Vinay',
  'su neel': 'Sunil',
  'suneel': 'Sunil',
  'sunil': 'Sunil',
  'mah esh': 'Mahesh',
  'mahesh': 'Mahesh',
  'su resh': 'Suresh',
  'suresh': 'Suresh',
  'ra mesh': 'Ramesh',
  'ramesh': 'Ramesh',
  'na resh': 'Naresh',
  'naresh': 'Naresh',
  'mu kesh': 'Mukesh',
  'mukesh': 'Mukesh',
  'la kshmi': 'Lakshmi',
  'laxmi': 'Lakshmi',
  'lakshmi': 'Lakshmi',
  'aa rav': 'Aarav',
  'a rav': 'Aarav',
  'aaraav': 'Aarav',
  'aarav': 'Aarav',
  'shar ma': 'Sharma',
  'sharma': 'Sharma',
  'ver ma': 'Verma',
  'verma': 'Verma',
  'pa tel': 'Patel',
  'patel': 'Patel',
  'ku mar': 'Kumar',
  'kumar': 'Kumar',
  'singh': 'Singh',
  'gup ta': 'Gupta',
  'gupta': 'Gupta'
};

/**
 * Normalizes spoken proper names, applying phonetic correction rules
 * for Indian names that are frequently distorted by standard speech recognition.
 * Example: "ash wind" -> "Ashwin", "ash win" -> "Ashwin", "ra vee" -> "Ravi"
 */
export function normalizeSpokenName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw
    .trim()
    .toLowerCase()
    .replace(/^(my name is|i am|name is|candidate name is|this is|enter name|it is)\s+/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // Direct full-phrase phonetic match
  if (PHONETIC_NAME_MAP[text]) {
    return PHONETIC_NAME_MAP[text];
  }

  // Multi-word phrase matching (e.g. "ash wind sharma" -> "Ashwin Sharma")
  let processed = text;
  for (const [misheard, corrected] of Object.entries(PHONETIC_NAME_MAP)) {
    // Only replace multi-word entries or exact words
    const regex = new RegExp(`\\b${misheard}\\b`, 'gi');
    if (regex.test(processed)) {
      processed = processed.replace(regex, corrected);
    }
  }

  // Capitalize each token properly
  return processed
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      // If already capitalized by dictionary, keep it
      if (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase()) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Spells out an identifier (email, roll number, or name) letter-by-letter
 * and symbol-by-symbol for auditory confirmation by visually impaired candidates.
 * Example: "Ashwin" -> "A, S, H, W, I, N"
 * Example: "ashwin@gmail.com" -> "A, S, H, W, I, N, at, G, M, A, I, L, dot, C, O, M"
 */
export function spellOutIdentifier(identifier: string): string {
  if (!identifier) return '';
  const chars = identifier.trim().split('');
  return chars
    .map((char) => {
      if (char === '@') return 'at';
      if (char === '.') return 'dot';
      if (char === '-') return 'dash';
      if (char === '_') return 'underscore';
      if (char === '+') return 'plus';
      if (char === ' ') return 'space';
      return char.toUpperCase();
    })
    .join(', ');
}

/**
 * Formats an Audio CAPTCHA code (e.g. "5 8 3 2" or "5832") into individual
 * spoken digits separated by short pauses:
 * Example: "5832" -> "Five ... Eight ... Three ... Two."
 */
export function formatCaptchaForSpeech(phrase: string): string {
  if (!phrase) return '';
  const digits = extractDigits(phrase);
  if (!digits) return phrase;

  const words = digits
    .split('')
    .map((d) => DIGIT_SPOKEN_WORD[d] || d);

  return `${words.join(' ... ')}.`;
}

/**
 * Normalizes spoken email or candidate roll number input into a clean identifier.
 * Examples:
 * - "aarav dot sharma at gmail dot com" -> "aarav.sharma@gmail.com"
 * - "candidate at accessprep dot nic dot in" -> "candidate@accessprep.nic.in"
 * - "s s c 2026 m t s 01" -> "SSC-2026-MTS-01"
 */
export function normalizeSpokenEmail(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim().toLowerCase();

  // Strip introductory conversational phrases
  text = text
    .replace(/^(my email address is|my email is|email is|email address|it is|this is|enter|type|my identifier is|my name is)\s+/i, '')
    .trim();

  // Check if user is speaking an SSC roll number (e.g. "ssc 2026 mts 01")
  const rollCheck = text.replace(/[\s\-_]+/g, '');
  const rollMatch = rollCheck.match(/^ssc(\d{4})mts(\d{1,4})$/i);
  if (rollMatch) {
    return `SSC-${rollMatch[1]}-MTS-${rollMatch[2].padStart(2, '0')}`;
  }

  // If input contains no email markers (@, at, dot), check if it's a spoken name
  const hasEmailMarker = /\b(at|dot|@|\.)\b/i.test(text);
  if (!hasEmailMarker) {
    const candidateName = normalizeSpokenName(text);
    if (candidateName) {
      return candidateName;
    }
  }

  // Pre-process phonetic names before email '@' (e.g. "ash wind at gmail dot com" -> "ashwin at gmail dot com")
  for (const [misheard, corrected] of Object.entries(PHONETIC_NAME_MAP)) {
    const rx = new RegExp(`\\b${misheard}\\b`, 'gi');
    if (rx.test(text)) {
      text = text.replace(rx, corrected.toLowerCase().replace(/\s+/g, ''));
    }
  }

  // Replace multi-word symbol phrases before single words
  text = text
    .replace(/\bat the rate of\b/g, '@')
    .replace(/\bat the rate\b/g, '@')
    .replace(/\bat sign\b/g, '@')
    .replace(/\bat symbol\b/g, '@')
    .replace(/\bdot co dot in\b/g, '.co.in')
    .replace(/\bdot nic dot in\b/g, '.nic.in')
    .replace(/\bdot gov dot in\b/g, '.gov.in')
    .replace(/\bdot ac dot in\b/g, '.ac.in')
    .replace(/\bdot org dot in\b/g, '.org.in')
    .replace(/\bdot com\b/g, '.com')
    .replace(/\bdot in\b/g, '.in')
    .replace(/\bdot org\b/g, '.org')
    .replace(/\bdot net\b/g, '.net')
    .replace(/\bdot edu\b/g, '.edu')
    .replace(/\bdot gov\b/g, '.gov')
    .replace(/\bunderscore\b/g, '_')
    .replace(/\bunder score\b/g, '_')
    .replace(/\bhyphen\b/g, '-')
    .replace(/\bdash\b/g, '-')
    .replace(/\bminus\b/g, '-')
    .replace(/\bplus\b/g, '+')
    .replace(/\b(?:dot|period|point|full stop)\b/g, '.')
    .replace(/\bat\b/g, '@');

  // Convert standalone spoken digit words to numbers if part of an email address
  const tokens = text.split(/\s+/);
  const convertedTokens = tokens.map((token) => SPOKEN_NUMBER_WORDS[token] ?? token);
  text = convertedTokens.join('');

  // Clean trailing punctuation other than valid email characters
  text = text.replace(/[^a-z0-9@._+\-]/g, '');

  return text;
}

/**
 * Validates standard email format.
 */
export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed);
}

/**
 * Validates Login identifier: accepts a valid email address,
 * an SSC Roll Number (e.g., SSC-2026-MTS-01, SSC-ADMIN-01),
 * or a registered candidate name (e.g., "Ashwin", "Aarav Sharma").
 */
export function validateLoginIdentifier(identifier: string): { valid: boolean; error?: string } {
  const trimmed = (identifier || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Please enter your registered email address or SSC Roll Number.'
    };
  }

  // If it contains '@' or looks like an email attempt, validate as email
  if (trimmed.includes('@')) {
    if (!validateEmailFormat(trimmed)) {
      return {
        valid: false,
        error: 'Please enter a valid email address (for example, student@example.com).'
      };
    }
    return { valid: true };
  }

  // Check if it's a valid SSC Roll Number or candidate identifier format (3 to 40 characters)
  if (/^[A-Za-z0-9\-_\s]{3,40}$/.test(trimmed)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: 'Please enter a valid email address or SSC Roll Number.'
  };
}

export type AuthVoiceCommandIntent =
  | 'what_can_i_do'
  | 'explain_page'
  | 'read_instructions'
  | 'read_all_fields'
  | 'repeat'
  | 'stop_speaking'
  | 'pause'
  | 'resume'
  | 'use_keyboard'
  | 'use_voice'
  | 'go_to_login'
  | 'go_to_register'
  | 'read_captcha'
  | 'refresh_captcha'
  | 'help';

/**
 * Parses shared and context-aware voice commands for Login and Registration pages.
 */
export function parseAuthVoiceCommand(
  rawTranscript: string,
  page: 'login' | 'register'
): AuthVoiceCommandIntent | null {
  if (!rawTranscript) return null;
  const t = rawTranscript
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return null;

  // 1. Stop / Pause / Resume
  if (
    t === 'stop' ||
    t === 'stop speaking' ||
    t === 'stop reading' ||
    t === 'stop audio' ||
    t === 'quiet' ||
    t === 'be quiet' ||
    t === 'silence'
  ) {
    return 'stop_speaking';
  }

  if (t === 'pause' || t === 'pause speaking' || t === 'pause reading' || t === 'pause audio') {
    return 'pause';
  }

  if (t === 'resume' || t === 'resume speaking' || t === 'resume reading' || t === 'continue reading') {
    return 'resume';
  }

  // 2. Repeat
  if (
    t === 'repeat' ||
    t === 'repeat question' ||
    t === 'repeat prompt' ||
    t === 'say again' ||
    t === 'say that again' ||
    t === 'read again'
  ) {
    return 'repeat';
  }

  // 3. CAPTCHA specific commands
  if (
    t === 'repeat captcha' ||
    t === 'read captcha' ||
    t === 'play captcha' ||
    t === 'listen captcha' ||
    t === 'hear captcha' ||
    t === 'audio captcha' ||
    t === 'read verification code' ||
    t === 'repeat verification code' ||
    t === 'read digits' ||
    t === 'repeat digits'
  ) {
    return 'read_captcha';
  }

  if (
    t === 'refresh captcha' ||
    t === 'new captcha' ||
    t === 'change captcha' ||
    t === 'regenerate captcha' ||
    t === 'refresh code' ||
    t === 'new code'
  ) {
    return 'refresh_captcha';
  }

  // 4. Switch between Voice and Keyboard
  if (
    t === 'use keyboard' ||
    t === 'switch to keyboard' ||
    t === 'keyboard mode' ||
    t === 'manual input' ||
    t === 'manual entry' ||
    t === 'type with keyboard'
  ) {
    return 'use_keyboard';
  }

  if (
    t === 'use voice' ||
    t === 'switch to voice' ||
    t === 'voice mode' ||
    (page === 'login' &&
      (t === 'start voice login' ||
        t === 'voice login' ||
        t === 'begin voice login' ||
        t === 'guided login' ||
        t === 'sign in with voice')) ||
    (page === 'register' &&
      (t === 'start voice registration' ||
        t === 'voice registration' ||
        t === 'begin voice registration' ||
        t === 'guided registration' ||
        t === 'register with voice'))
  ) {
    return 'use_voice';
  }

  // 5. Cross-page navigation between Login and Registration
  if (
    t === 'go to login' ||
    t === 'open login' ||
    t === 'back to login' ||
    t === 'sign in page' ||
    t === 'login page' ||
    (page === 'register' && (t === 'login' || t === 'sign in'))
  ) {
    return 'go_to_login';
  }

  if (
    t === 'go to registration' ||
    t === 'go to register' ||
    t === 'open registration' ||
    t === 'open register' ||
    t === 'create account' ||
    t === 'registration page' ||
    t === 'register page' ||
    (page === 'login' && (t === 'register' || t === 'registration' || t === 'sign up'))
  ) {
    return 'go_to_register';
  }

  // 6. Page explanation & instructions
  if (
    t === 'explain this page' ||
    t === 'explain page' ||
    t === 'about this page' ||
    t === 'describe this page' ||
    t === 'where am i'
  ) {
    return 'explain_page';
  }

  if (
    t === 'what can i do here' ||
    t === 'what can i do' ||
    t === 'available actions' ||
    t === 'what are my options'
  ) {
    return 'what_can_i_do';
  }

  if (
    t === 'read instructions' ||
    t === 'instructions' ||
    t === 'read guide' ||
    (page === 'login' && (t === 'read login guide' || t === 'login instructions' || t === 'login guide')) ||
    (page === 'register' &&
      (t === 'read registration guide' || t === 'registration instructions' || t === 'registration guide'))
  ) {
    return 'read_instructions';
  }

  if (
    t === 'read all fields' ||
    t === 'read fields' ||
    t === 'list fields' ||
    t === 'what are the fields' ||
    t === 'form fields'
  ) {
    return 'read_all_fields';
  }

  if (t === 'help' || t === 'voice commands' || t === 'commands') {
    return 'help';
  }

  return null;
}
