/**
 * ACCESSPREP-X Voice Command Parser
 * Deterministic, phonetic-tolerant natural language normalization and intent routing.
 */

import { ScreenId } from '../types/screens.ts';
import { SCREEN_TARGETS, PRACTICE_SUBJECT_TRIGGERS } from './commandRegistry.ts';
import { NavigationTarget, CommandIntentType } from './commandTypes.ts';

/**
 * Normalizes speech input into a clean string without punctuation and excess whitespace.
 */
export function cleanVoiceTranscript(raw: string): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Phonetic / Homophone replacements for common speech recognition inaccuracies
 */
export function normalizePhonetics(cleanText: string): string {
  let text = cleanText;

  // "ai tutor" homophones
  text = text.replace(/\b(eye|i|aye)\s+tutor\b/g, 'ai tutor');
  text = text.replace(/\b(eye|i|aye)\s+scribe\b/g, 'ai tutor');

  // "mock test" / "mock exam"
  text = text.replace(/\bmark\s+test\b/g, 'mock test');
  text = text.replace(/\bmark\s+exam\b/g, 'mock exam');
  text = text.replace(/\bmox\s+exam\b/g, 'mock exam');

  // "dashboard"
  text = text.replace(/\bdash\s+board\b/g, 'dashboard');

  // "sm2"
  text = text.replace(/\bsm\s*2\b/g, 'sm2');

  // "bkt"
  text = text.replace(/\bb\s*k\s*t\b/g, 'bkt');

  // Numbers in navigation phrases: "screen 4", "screen four"
  text = text.replace(/\bscreen\s+(four|4)\b/g, 'dashboard');
  text = text.replace(/\bscreen\s+(seven|7)\b/g, 'mock exam');
  text = text.replace(/\bscreen\s+(nine|9)\b/g, 'ai tutor');

  return text.trim();
}

/**
 * Detects if the transcript represents a confirmation response (Yes / No)
 */
export function parseConfirmationIntent(cleanText: string): 'yes' | 'no' | null {
  const t = cleanText.trim();

  // Check "no" first because multi-word no-phrases can overlap with yes-words
  const noMatches = [
    'no',
    'nope',
    'cancel',
    'stay',
    'dont leave',
    'do not leave',
    'resume',
    'resume exam',
    'negative',
    'no keep going',
    'no stay',
    'no please'
  ];

  const yesMatches = [
    'yes',
    'yeah',
    'yep',
    'sure',
    'confirm',
    'leave',
    'pause and leave',
    'pause exam',
    'proceed',
    'ok',
    'okay',
    'affirmative',
    'yes please',
    'yes pause'
  ];

  // Exact match first for both lists
  if (noMatches.includes(t)) return 'no';
  if (yesMatches.includes(t)) return 'yes';

  // Partial match — no before yes to avoid overlap
  if (noMatches.some((m) => m.includes(' ') && (t.startsWith(m + ' ') || t.endsWith(' ' + m)))) {
    return 'no';
  }

  if (yesMatches.some((m) => m.includes(' ') && (t.startsWith(m + ' ') || t.endsWith(' ' + m)))) {
    return 'yes';
  }

  return null;
}

/**
 * Detects system level control commands (stop speaking, pause, resume, read slower, repeat)
 */
export function parseSystemControl(
  cleanText: string
): 'stop_speaking' | 'pause_reading' | 'resume_reading' | 'read_slower' | 'repeat' | 'scroll_down' | 'scroll_up' | null {
  const t = cleanText.trim();

  // 1. Pause Commands
  const pausePhrases = ['pause reading', 'pause speaking', 'pause audio', 'pause'];
  if (pausePhrases.some((p) => t === p)) {
    return 'pause_reading';
  }

  // 2. Resume Commands
  const resumePhrases = ['resume reading', 'resume speaking', 'continue reading', 'resume audio', 'resume'];
  if (resumePhrases.some((p) => t === p)) {
    return 'resume_reading';
  }

  // 3. Speed Commands
  const slowerPhrases = ['read slower', 'speak slower', 'talk slower', 'slow down', 'slower'];
  if (slowerPhrases.some((p) => t === p || t.includes(p))) {
    return 'read_slower';
  }

  // 4. Stop Commands
  const stopPhrases = [
    'stop',
    'stop speaking',
    'stop reading',
    'stop talking',
    'stop audio',
    'stop speech',
    'be quiet',
    'silence',
    'mute',
    'shut up',
    'quiet'
  ];

  if (
    t === 'stop' ||
    t === 'hey vision stop' ||
    t === 'vision stop' ||
    stopPhrases.some((p) => t === p || t.startsWith('stop ') || t.endsWith(' stop') || t.includes(p))
  ) {
    return 'stop_speaking';
  }

  // 5. Repeat Commands
  const repeatPhrases = [
    'repeat',
    'say that again',
    'say again',
    'repeat last message',
    'repeat question',
    'read again',
    'what did you say'
  ];

  if (repeatPhrases.some((p) => t === p)) {
    return 'repeat';
  }

  // 6. Scroll Commands
  const scrollDownPhrases = ['scroll down', 'page down', 'scroll page down', 'scroll downwards'];
  if (scrollDownPhrases.some((p) => t === p)) {
    return 'scroll_down';
  }

  const scrollUpPhrases = ['scroll up', 'page up', 'scroll page up', 'scroll upwards'];
  if (scrollUpPhrases.some((p) => t === p)) {
    return 'scroll_up';
  }

  return null;
}

/**
 * Detects global voice assistance intents
 */
export function parseAssistanceIntent(
  cleanText: string
): 'where_am_i' | 'what_can_i_do' | 'help_navigation' | 'go_back' | 'logout' | null {
  const t = cleanText.trim();

  // Where am I
  if (
    t === 'where am i' ||
    t === 'what screen is this' ||
    t === 'where are we' ||
    t === 'current screen' ||
    t === 'what is this screen' ||
    t === 'tell me where i am'
  ) {
    return 'where_am_i';
  }

  // What can I do here / page-specific commands
  if (
    t === 'what can i do here' ||
    t === 'what can i do' ||
    t === 'screen help' ||
    t === 'available actions' ||
    t === 'what actions can i take' ||
    t === 'help on this screen' ||
    t === 'what are my options' ||
    t === 'page commands' ||
    t === 'voice commands'
  ) {
    return 'what_can_i_do';
  }

  // Help navigation / command overview (lists all available screens)
  if (
    t === 'help me navigate' ||
    t === 'help navigate' ||
    t === 'navigation help' ||
    t === 'how do i navigate' ||
    t === 'list screens' ||
    t === 'available screens' ||
    t === 'help' ||
    t === 'commands' ||
    t === 'menu'
  ) {
    return 'help_navigation';
  }

  // Go back
  if (
    t === 'go back' ||
    t === 'back' ||
    t === 'previous screen' ||
    t === 'return' ||
    t === 'last screen' ||
    t === 'take me back'
  ) {
    return 'go_back';
  }

  // Logout
  if (
    t === 'log out' ||
    t === 'logout' ||
    t === 'sign out' ||
    t === 'sign off' ||
    t === 'exit portal' ||
    t === 'quit'
  ) {
    return 'logout';
  }

  return null;
}

/**
 * Detects wake-word activation and deactivation for Vision Assistant.
 * Wake phrase: "Hey Vision"
 */
export function parseVisionWakeWord(cleanText: string): 'activate_vision' | 'deactivate_vision' | null {
  const t = cleanText.toLowerCase().trim();

  // Deactivation check first
  if (
    t === 'deactivate vision' ||
    t === 'deactivate vision assistant' ||
    t === 'turn off vision' ||
    t === 'disable vision' ||
    t === 'stop vision' ||
    t === 'exit vision'
  ) {
    return 'deactivate_vision';
  }

  // Wake-word activation — robust against phonetic and colloquial variations
  if (
    t === 'hey vision' ||
    t === 'hey vision assistant' ||
    t === 'activate vision' ||
    t === 'activate vision assistant' ||
    t === 'turn on vision' ||
    t === 'enable vision' ||
    t === 'start vision' ||
    t === 'vision assistant' ||
    t === 'vision' ||
    t === 'hi vision' ||
    t === 'hello vision' ||
    t === 'okay vision' ||
    t === 'ok vision' ||
    t === 'a vision' ||
    t === 'hey visual' ||
    t === 'hai vision' ||
    t.startsWith('hey vision ') ||
    t.startsWith('vision assistant ') ||
    t.startsWith('hi vision ') ||
    t.startsWith('hello vision ') ||
    t.startsWith('activate vision ') ||
    t.includes('hey vision')
  ) {
    return 'activate_vision';
  }

  return null;
}

export interface SpeechSettingCommand {
  type: 'rate' | 'pitch';
  value: number;
}

/**
 * Parses spoken speech rate and pitch commands:
 * Examples: "Set speech speed to 1.5x", "Set speed to 3x", "Set pitch to 1.2"
 */
export function parseSpeechSettingCommand(cleanText: string): SpeechSettingCommand | null {
  const t = cleanText.toLowerCase().trim();

  // 1. Rate commands
  const rateMatch = t.match(/(?:set\s+)?(?:speech\s+)?(?:speed|rate)(?:\s+to)?\s+([0-9]+(?:\.[0-9]+)?)\s*x?/i);
  if (rateMatch && rateMatch[1]) {
    const val = parseFloat(rateMatch[1]);
    if (!isNaN(val) && val >= 0.25 && val <= 4.0) {
      return { type: 'rate', value: val };
    }
  }

  const suffixRateMatch = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*x\s*(?:speed|rate)?$/i);
  if (suffixRateMatch && suffixRateMatch[1]) {
    const val = parseFloat(suffixRateMatch[1]);
    if (!isNaN(val) && val >= 0.25 && val <= 4.0) {
      return { type: 'rate', value: val };
    }
  }

  // 2. Pitch commands
  const pitchMatch = t.match(/(?:set\s+)?(?:speech\s+)?pitch(?:\s+to)?\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (pitchMatch && pitchMatch[1]) {
    const val = parseFloat(pitchMatch[1]);
    if (!isNaN(val) && val >= 0.4 && val <= 2.2) {
      return { type: 'pitch', value: val };
    }
  }

  return null;
}

export type SubjectSelectionResult =
  | { type: 'prompt_subjects' }
  | { type: 'recommend_subject' }
  | {
      type: 'choose_subject';
      subject:
        | 'Numerical and Mathematical Ability'
        | 'Reasoning Ability and Problem Solving'
        | 'General Awareness'
        | 'English Language and Comprehension'
        | 'all';
      label: string;
    };

/**
 * Parses spoken intent for selecting subject in Voice Practice and Revision Planner.
 * Supports:
 * - "Select subject", "Read available subjects", "Change subject"
 * - "Recommend subject", "What should I revise", "Recommend weak topics"
 * - Exact subject names and natural shorthand aliases ("Select reasoning", "Open math", etc.)
 */
export function parseSubjectSelectionIntent(cleanText: string): SubjectSelectionResult | null {
  const t = cleanText.toLowerCase().trim();

  // 1. Prompting for available subjects
  const promptPhrases = [
    'select subject',
    'choose subject',
    'change subject',
    'read available subjects',
    'read subjects',
    'what subjects are available',
    'list subjects',
    'show subjects',
    'available subjects',
    'all subjects',
    'please select subject'
  ];
  if (promptPhrases.some((p) => t === p || t.startsWith(p + ' ') || t.endsWith(' ' + p))) {
    return { type: 'prompt_subjects' };
  }

  // 1b. Requesting weak topic / subject recommendation
  const recommendPhrases = [
    'recommend subject',
    'recommend a subject',
    'what should i revise',
    'what do you recommend',
    'suggest subject',
    'suggest a subject',
    'recommend weak topics',
    'recommend weak subject',
    'weakest topic',
    'weakest subject',
    'weak topics'
  ];
  if (recommendPhrases.some((p) => t === p || t.includes(p))) {
    return { type: 'recommend_subject' };
  }

  // 2. Numerical and Mathematical Ability
  const mathPhrases = [
    'numerical and mathematical ability',
    'numerical ability and mathematical ability',
    'numerical ability',
    'mathematical ability',
    'math',
    'mathematics',
    'numerical',
    'select numerical and mathematical ability',
    'select numerical ability',
    'select math',
    'open numerical ability',
    'open math',
    'choose math',
    'practice math',
    'option 1',
    'option one',
    'subject 1',
    'subject one',
    'number 1',
    '1'
  ];
  if (mathPhrases.some((p) => t === p || t.includes(p))) {
    return {
      type: 'choose_subject',
      subject: 'Numerical and Mathematical Ability',
      label: 'Numerical & Mathematical Ability'
    };
  }

  // 3. Reasoning Ability and Problem Solving
  const reasoningPhrases = [
    'reasoning ability and problem solving',
    'reasoning ability',
    'problem solving',
    'reasoning',
    'select reasoning ability and problem solving',
    'select reasoning ability',
    'select reasoning',
    'open reasoning ability and problem solving',
    'open reasoning',
    'choose reasoning',
    'practice reasoning',
    'option 2',
    'option two',
    'subject 2',
    'subject two',
    'number 2',
    '2'
  ];
  if (reasoningPhrases.some((p) => t === p || t.includes(p))) {
    return {
      type: 'choose_subject',
      subject: 'Reasoning Ability and Problem Solving',
      label: 'Reasoning Ability'
    };
  }

  // 4. General Awareness
  const gaPhrases = [
    'general awareness',
    'general knowledge',
    'gk',
    'ga',
    'awareness',
    'select general awareness',
    'choose general awareness',
    'open general awareness',
    'practice general awareness',
    'practice gk',
    'select gk',
    'option 3',
    'option three',
    'subject 3',
    'subject three',
    'number 3',
    '3'
  ];
  if (gaPhrases.some((p) => t === p || t.includes(p))) {
    return {
      type: 'choose_subject',
      subject: 'General Awareness',
      label: 'General Awareness'
    };
  }

  // 5. English Language and Comprehension
  const englishPhrases = [
    'english language and comprehension',
    'english language',
    'english comprehension',
    'english',
    'select english language and comprehension',
    'select english language',
    'select english',
    'open english language and comprehension',
    'open english',
    'choose english',
    'practice english',
    'option 4',
    'option four',
    'subject 4',
    'subject four',
    'number 4',
    '4'
  ];
  if (englishPhrases.some((p) => t === p || t.includes(p))) {
    return {
      type: 'choose_subject',
      subject: 'English Language and Comprehension',
      label: 'English Language'
    };
  }

  // 6. All Subjects
  const allPhrases = [
    'all subjects',
    'all',
    'full syllabus',
    'select all subjects',
    'choose all subjects',
    'practice all subjects',
    'option 5',
    'option five',
    'subject 5',
    '5'
  ];
  if (allPhrases.some((p) => t === p || t.includes(p))) {
    return {
      type: 'choose_subject',
      subject: 'all',
      label: 'All Subjects'
    };
  }

  return null;
}

export interface MatchedScreenResult {
  target: NavigationTarget;
  subjectFilter?: string;
  subjectLabel?: string;
  confidence: number;
}

/**
 * Strips conversational filler prefixes such as "please go to", "i want to open", etc.
 */
export function stripNavigationPrefixes(text: string): string {
  let cleaned = text.trim();

  const prefixes = [
    'please open',
    'please go to',
    'please navigate to',
    'please take me to',
    'please show me',
    'please show',
    'please switch to',
    'can you open',
    'can you go to',
    'can you take me to',
    'could you open',
    'could you go to',
    'i want to open',
    'i want to go to',
    'i want to practice',
    'i want to take',
    'take me to',
    'navigate to',
    'switch to',
    'jump to',
    'bring me to',
    'go to',
    'open',
    'show me',
    'show my',
    'show',
    'view',
    'launch'
  ];

  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix + ' ')) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }

  return cleaned;
}

/**
 * Matches a spoken transcript to one of the 16 approved screens.
 */
export function matchScreenNavigation(
  rawTranscript: string,
  currentScreen?: ScreenId
): MatchedScreenResult | null {
  const clean = cleanVoiceTranscript(rawTranscript);
  const normalized = normalizePhonetics(clean);

  // 1. Check Practice Subject specific triggers first
  for (const trigger of PRACTICE_SUBJECT_TRIGGERS) {
    if (normalized.includes(trigger.phrase)) {
      return {
        target: SCREEN_TARGETS['voice_practice'],
        subjectFilter: trigger.subject,
        subjectLabel: trigger.label,
        confidence: 0.95
      };
    }
  }

  // 2. Strip filler verbs
  const stripped = stripNavigationPrefixes(normalized);

  // Guard against words that are primarily screen controls on specific screens:
  // e.g. "review" on mock_exam means review questions, not Revision Planner.
  // "repeat" means repeat question, not results.
  // "submit" means submit exam, not login/registration.
  if (currentScreen === 'mock_exam') {
    if (
      normalized === 'review' ||
      normalized === 'review test' ||
      normalized === 'repeat' ||
      normalized === 'submit' ||
      normalized === 'previous' ||
      normalized === 'back'
    ) {
      return null; // Let mock exam screen handle local control
    }
  }

  if (currentScreen === 'revision_planner') {
    if (
      normalized === 'next' ||
      normalized === 'skip' ||
      normalized === 'flip' ||
      normalized === 'reveal' ||
      normalized === 'reveal answer' ||
      normalized === 'show answer' ||
      normalized === 'again' ||
      normalized === 'hard' ||
      normalized === 'good' ||
      normalized === 'easy' ||
      normalized === 'pause' ||
      normalized === 'resume' ||
      normalized === 'previous' ||
      normalized === 'start revision' ||
      normalized === 'start revision session' ||
      normalized === 'start session' ||
      normalized === 'start drill'
    ) {
      return null;
    }
  }

  const screenIds = Object.keys(SCREEN_TARGETS) as ScreenId[];

  // 3. Priority Pass 1: Exact alias match across all screens
  for (const screenId of screenIds) {
    const target = SCREEN_TARGETS[screenId];
    for (const alias of target.aliases) {
      const cleanAlias = cleanVoiceTranscript(alias);
      if (stripped === cleanAlias || normalized === cleanAlias) {
        return { target, confidence: 1.0 };
      }
    }
  }

  // Priority Pass 2: Multi-word contains across all screens (e.g. "take me to the ai tutor right now")
  for (const screenId of screenIds) {
    const target = SCREEN_TARGETS[screenId];
    for (const alias of target.aliases) {
      const cleanAlias = cleanVoiceTranscript(alias);
      if (cleanAlias.includes(' ') && (normalized.includes(cleanAlias) || stripped.includes(cleanAlias))) {
        return { target, confidence: 0.85 };
      }
    }
  }

  // Priority Pass 3: Suffix matches (e.g. "please open student dashboard")
  for (const screenId of screenIds) {
    const target = SCREEN_TARGETS[screenId];
    for (const alias of target.aliases) {
      const cleanAlias = cleanVoiceTranscript(alias);
      if (normalized.endsWith(' ' + cleanAlias) || stripped.endsWith(' ' + cleanAlias)) {
        return { target, confidence: 0.9 };
      }
    }
  }

  return null;
}

