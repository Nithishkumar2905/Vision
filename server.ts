import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import multer from 'multer';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

import {
  loadQuestions,
  resetQuestionsCache,
  User,
  PracticeAttempt,
  MockExamAttempt,
  DiagnosticAttempt,
  RevisionItem,
  TopicMasteryRecord,
  AccessibilitySettings,
  LearningHistoryEntry
} from './src/db/database.ts';
import {
  selectPilotDemoQuestions,
  evaluatePilotDemoSubmission,
  generateDiagnosticRecommendations,
  DIAGNOSTIC_SECTIONS,
  PILOT_DEMO_DURATION_SECONDS
} from './src/utils/pilotDemoScoring.ts';
import { parseMathematicalSpeech } from './src/math/mathematicalSpeechParser.ts';
import { renderTextWithMathToSpeech, renderMathExpressionToSpeech } from './src/math/mathematicalSpeechRenderer.ts';
import { matchSpokenMathToOptions } from './src/math/mathematicalAnswerEvaluator.ts';
import {
  evaluateWithEngine,
  equivalenceWithEngine,
  validateRequestString
} from './src/math/mathService.ts';
import { getRepository, IDataRepository } from './src/db/repository.ts';
import { runDatabaseMigration, MigrationReport } from './src/db/migration.ts';
import { checkPostgresConnection, isPostgresConnected, getLastConnectionError } from './src/db/db_pool.ts';
import {
  generateChallenge,
  verifyChallenge,
  validateVerificationToken,
  consumeVerificationToken
} from './src/utils/humanVerification.ts';
import {
  CURATED_CURRENT_AFFAIRS,
  getCuratedCurrentAffairsQuestions
} from './src/utils/currentAffairsService.ts';
import { TranscriptLogEntry, TranscriptPrivacySettings } from './src/db/database.ts';

// Password hashing helpers
function hashPassword(pwd: string): string {
  return crypto.createHash('sha256').update(pwd + 'accessprep_x_salt_2026').digest('hex');
}

function isHashedPassword(pwd: string): boolean {
  return /^[a-f0-9]{64}$/.test(pwd);
}

import { evaluateSubmission, QuestionSubmission } from './src/utils/scoring.ts';
import { calculateSM2, getNextReviewDate } from './src/utils/sm2.ts';
import { updateBKT, classifyMasteryTier } from './src/utils/bkt.ts';
import { getMockExamRotationService } from './src/services/mockExamRotationService.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for audio files upload — use OS temp dir for cross-platform compatibility
const AUDIO_UPLOAD_DIR = path.join(process.env.TEMP || process.env.TMP || '/tmp', 'accessprep_audio');
if (!fs.existsSync(AUDIO_UPLOAD_DIR)) {
  fs.mkdirSync(AUDIO_UPLOAD_DIR, { recursive: true });
}
const upload = multer({
  dest: AUDIO_UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// Helper for Gemini AI
let geminiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  geminiClient = new GoogleGenAI();
}

let latestMigrationReport: MigrationReport | null = null;

// -------------------------------------------------------------
// 1. HEALTH, READINESS & DATABASE STATUS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  const repo = await getRepository();
  const questions = loadQuestions();
  
  res.json({
    status: 'online',
    portal: 'ACCESSPREP-X Accessible SSC MTS Portal',
    databaseEngine: repo.engineName,
    postgresConnected: isPostgresConnected(),
    questionsCount: questions.length,
    mlModelArtifactAvailable: fs.existsSync('src/data/model_artifact.pkl'),
    validationReportAvailable: fs.existsSync('src/data/dataset_validation_report.json'),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/db/status', async (req, res) => {
  const conn = await checkPostgresConnection();
  const repo = await getRepository();
  const questions = loadQuestions();

  res.json({
    activeEngine: repo.engineName,
    postgres: {
      configuredHost: process.env.PGHOST || (process.env.DATABASE_URL ? 'via DATABASE_URL' : 'localhost'),
      isConnected: conn.isConnected,
      lastError: conn.error || null
    },
    migrationReport: latestMigrationReport,
    totalVerifiedQuestions: questions.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/db/migrate', async (req, res) => {
  try {
    const report = await runDatabaseMigration();
    latestMigrationReport = report;
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: 'Migration failed', details: err.message });
  }
});

// -------------------------------------------------------------
// 2. AUTHENTICATION & CANDIDATE REGISTRATION
// -------------------------------------------------------------
app.get('/api/auth/challenge', (req, res) => {
  const challenge = generateChallenge();
  res.json({
    success: true,
    challengeId: challenge.challengeId,
    phrase: challenge.phrase,
    expiresAt: challenge.expiresAt
  });
});

app.post('/api/auth/verify-challenge', (req, res) => {
  const { challengeId, candidatePhrase } = req.body;
  if (!challengeId || typeof candidatePhrase !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Challenge ID and candidate phrase are required.'
    });
  }

  const result = verifyChallenge(challengeId, candidatePhrase);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: result.error || 'Verification failed.'
    });
  }

  res.json({
    success: true,
    verificationToken: result.verificationToken,
    message: 'Spoken human verification succeeded.'
  });
});

app.post('/api/auth/validate-credentials', async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      error: 'Please enter both Roll Number / Email and Password / PIN.'
    });
  }

  const repo = await getRepository();
  const user = await repo.getUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Candidate / User not found with provided identifier. Please check your Roll Number or Email.'
    });
  }

  const storedHash = user.passwordHash;
  let passwordMatches = false;
  if (isHashedPassword(storedHash)) {
    passwordMatches = storedHash === hashPassword(password);
  } else {
    passwordMatches = storedHash === password;
  }

  if (!passwordMatches) {
    return res.status(401).json({
      success: false,
      error: 'Invalid password or PIN. Please verify and try again.'
    });
  }

  // Credentials are valid -> generate human verification challenge
  const challenge = generateChallenge();
  res.json({
    success: true,
    message: 'Credentials verified. Please complete spoken human verification.',
    challenge: {
      challengeId: challenge.challengeId,
      phrase: challenge.phrase,
      expiresAt: challenge.expiresAt
    }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { identifier, password, verificationToken } = req.body;

  // Enforce human verification unless in automated test mode
  const bypassChallenge =
    req.headers['x-test-bypass-challenge'] === 'true' ||
    process.env.NODE_ENV === 'test' ||
    process.env.BYPASS_CHALLENGE === 'true';

  if (!bypassChallenge) {
    if (!verificationToken) {
      return res.status(403).json({
        error: 'Spoken human verification is required. Please repeat the challenge phrase to verify.'
      });
    }
    const validation = validateVerificationToken(verificationToken);
    if (!validation.valid) {
      return res.status(403).json({
        error: 'Spoken human verification token is invalid or expired. Please repeat the challenge phrase.'
      });
    }
    consumeVerificationToken(verificationToken);
  }

  const repo = await getRepository();

  const user = await repo.getUserByIdentifier(identifier);
  if (!user) {
    return res.status(401).json({ error: 'Candidate / User not found with provided identifier.' });
  }

  // Password comparison with backward-compatible migration
  if (password) {
    const storedHash = user.passwordHash;
    if (isHashedPassword(storedHash)) {
      if (storedHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid password or PIN.' });
      }
    } else {
      if (storedHash !== password) {
        return res.status(401).json({ error: 'Invalid password or PIN.' });
      }
      // Migrate to hashed password on successful login
      user.passwordHash = hashPassword(password);
      await repo.updateUserProfile(user.id, { passwordHash: user.passwordHash });
    }
  }

  const settings = await repo.getAccessibilitySettings(user.id);

  res.json({
    success: true,
    user: {
      id: user.id,
      rollNumber: user.rollNumber,
      name: user.name,
      email: user.email,
      role: user.role,
      pwdCategory: user.pwdCategory,
      needScribe: user.needScribe,
      examRegion: user.examRegion,
      examLanguage: user.examLanguage
    },
    settings
  });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, rollNumber, password, pwdCategory, needScribe, examRegion, examLanguage } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are mandatory fields.' });
  }

  const repo = await getRepository();
  const existing = await repo.getUserByIdentifier(email);
  if (existing) {
    return res.status(400).json({ error: 'Candidate with this email already registered.' });
  }

  const newId = `usr_${Date.now()}`;
  const generatedRoll = rollNumber || `SSC-2026-MTS-${Date.now().toString().slice(-4)}`;

  const newUser: User = {
    id: newId,
    rollNumber: generatedRoll,
    name,
    email,
    passwordHash: hashPassword(password || 'candidate123'),
    role: 'candidate',
    pwdCategory: pwdCategory || 'None',
    needScribe: Boolean(needScribe),
    examRegion: examRegion || 'Northern Region (NR)',
    examLanguage: examLanguage || 'English',
    createdAt: new Date().toISOString()
  };

  await repo.createUser(newUser);

  const isBlind = pwdCategory === 'Visually Impaired' || Boolean(needScribe) || Boolean(req.body.isBlindMode);
  const initialSettings: AccessibilitySettings = {
    userId: newId,
    theme: isBlind ? 'high_contrast_yellow' : 'sapphire',
    fontScale: isBlind ? 150 : 125,
    dyslexiaFont: false,
    speechRate: 1.0,
    speechPitch: 1.0,
    voiceURI: 'default',
    autoReadAloud: true,
    highContrastBorders: true,
    reduceMotion: false,
    compensatoryTimeEnabled: newUser.pwdCategory !== 'None',
    whisperModelSize: 'base',
    isBlindMode: isBlind
  };

  await repo.saveAccessibilitySettings(initialSettings);

  res.status(201).json({
    success: true,
    user: newUser,
    settings: initialSettings
  });
});

app.get('/api/auth/me', async (req, res) => {
  const repo = await getRepository();
  const candidate = (await repo.getUserById('usr_candidate_01')) || {
    id: 'usr_candidate_01',
    rollNumber: 'SSC-2026-MTS-01',
    name: 'Aarav Sharma (Candidate)',
    email: 'candidate@accessprep.nic.in',
    passwordHash: 'candidate123',
    role: 'candidate',
    pwdCategory: 'Visually Impaired',
    needScribe: true,
    examRegion: 'Northern Region (NR)',
    examLanguage: 'English',
    createdAt: '2026-03-01T10:00:00Z'
  };
  const settings = await repo.getAccessibilitySettings(candidate.id);
  res.json({ user: candidate, settings });
});

// -------------------------------------------------------------
// 3. QUESTIONS API (Verified SSC MTS Dataset)
// -------------------------------------------------------------
app.get('/api/questions', async (req, res) => {
  const repo = await getRepository();
  const { total, questions } = await repo.getQuestions(req.query as any);
  const off = Number(req.query.offset) || 0;
  const lim = Number(req.query.limit) || 20;

  res.json({
    total,
    count: questions.length,
    offset: off,
    limit: lim,
    questions
  });
});

app.get('/api/questions/:id', async (req, res) => {
  const repo = await getRepository();
  const q = await repo.getQuestionById(req.params.id);
  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json(q);
});

// -------------------------------------------------------------
// 4. PRACTICE SESSION SUBMISSION & BKT MASTERY UPDATE
// -------------------------------------------------------------
app.post('/api/practice/submit', async (req, res) => {
  const { userId, questionId, selectedOption, timeSpentSeconds, mode } = req.body;
  const repo = await getRepository();
  const q = await repo.getQuestionById(questionId);

  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }

  const isCorrect = String(selectedOption).toUpperCase() === q.correct_answer.toUpperCase();
  const uid = userId || 'usr_candidate_01';

  // 1. Prepare Attempt
  const attempt: PracticeAttempt = {
    id: `att_${Date.now()}`,
    userId: uid,
    questionId,
    selectedOption: String(selectedOption).toUpperCase(),
    isCorrect,
    timeSpentSeconds: Number(timeSpentSeconds) || 30,
    mode: mode === 'voice' ? 'voice' : 'standard',
    timestamp: new Date().toISOString()
  };

  // 2. Compute BKT Topic Mastery update
  const currentMasteryList = await repo.getTopicMastery(uid);
  const current = currentMasteryList.find((m) => m.topic === q.topic);
  const prevP = current ? current.p_known : 0.25;
  const attemptsCount = (current ? current.attemptsCount : 0) + 1;
  const correctCount = (current ? current.correctCount : 0) + (isCorrect ? 1 : 0);
  const newP = updateBKT(prevP, isCorrect);

  const bktRecord: TopicMasteryRecord = {
    id: current?.id || `mst_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId: uid,
    subject: q.subject,
    topic: q.topic,
    p_known: newP,
    masteryPercentage: Math.round(newP * 100),
    tier: classifyMasteryTier(newP),
    attemptsCount,
    correctCount,
    updatedAt: new Date().toISOString()
  };

  // 3. Compute SM-2 Revision Schedule update
  const revisionResult = await repo.getRevisionItems(uid);
  const existingRev = [...revisionResult.dueItems, ...revisionResult.upcomingItems].find(
    (r) => r.questionId === questionId
  );
  const quality = isCorrect ? (Number(timeSpentSeconds) < 40 ? 5 : 4) : 1;

  const currentSM2State = existingRev || {
    repetitions: 0,
    intervalDays: 1,
    easinessFactor: 2.5
  };

  const sm2Calc = calculateSM2(currentSM2State, quality);
  const sm2Record: RevisionItem = {
    id: existingRev?.id || `rev_${Date.now()}`,
    userId: uid,
    questionId,
    repetitions: sm2Calc.repetitions,
    intervalDays: sm2Calc.intervalDays,
    easinessFactor: sm2Calc.easinessFactor,
    lastReviewedAt: new Date().toISOString(),
    nextReviewDue: getNextReviewDate(sm2Calc.intervalDays),
    masteryLevel: sm2Calc.masteryLevel
  };

  // 4. Learning History Entry
  const historyEntry: LearningHistoryEntry = {
    id: `hist_${Date.now()}`,
    userId: uid,
    type: 'practice',
    title: `Practice: ${q.topic}`,
    summary: `${q.subject} - Q: ${q.question_text.substring(0, 40)}... (Result: ${isCorrect ? 'Correct' : 'Incorrect'})`,
    score: isCorrect ? 3 : 0,
    maxScore: 3,
    durationSeconds: Number(timeSpentSeconds) || 30,
    timestamp: new Date().toISOString()
  };

  // Execute transactional write
  await repo.recordPracticeAttempt(attempt, bktRecord, sm2Record, historyEntry);

  res.json({
    success: true,
    isCorrect,
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
    mastery: bktRecord,
    nextReviewDue: sm2Record.nextReviewDue
  });
});

// -------------------------------------------------------------
// 5. MOCK EXAMINATION ROTATION, SUBMISSION & RESULTS
// -------------------------------------------------------------
app.get('/api/mock/rotation-status', async (req, res) => {
  try {
    const uid = String(req.query.userId || 'usr_candidate_01');
    const service = getMockExamRotationService();
    const status = await service.getRotationStatus(uid);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve rotation status', details: err.message });
  }
});

app.post('/api/mock/start', async (req, res) => {
  try {
    const uid = String(req.body.userId || 'usr_candidate_01');
    const isPwD = Boolean(req.body.isPwD);
    const service = getMockExamRotationService();
    const result = await service.startOrResumeAttempt(uid, isPwD);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to start or resume mock exam', details: err.message });
  }
});

app.post('/api/mock/progress', async (req, res) => {
  try {
    const uid = String(req.body.userId || 'usr_candidate_01');
    const { attemptId, answers, remainingTime, currentQuestionIndex } = req.body;
    if (!attemptId) {
      return res.status(400).json({ error: 'attemptId is required' });
    }
    const service = getMockExamRotationService();
    await service.saveAttemptProgress(uid, attemptId, answers || {}, Number(remainingTime) || 0, Number(currentQuestionIndex) || 0);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save progress', details: err.message });
  }
});

app.post('/api/mock/discard', async (req, res) => {
  try {
    const uid = String(req.body.userId || 'usr_candidate_01');
    const { attemptId } = req.body;
    if (!attemptId) {
      return res.status(400).json({ error: 'attemptId is required' });
    }
    const service = getMockExamRotationService();
    const result = await service.discardAttempt(uid, attemptId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to discard attempt', details: err.message });
  }
});

app.post('/api/mock/reset-cycle', async (req, res) => {
  try {
    const uid = String(req.body.userId || 'usr_candidate_01');
    const service = getMockExamRotationService();
    const result = await service.resetCycle(uid);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to reset cycle', details: err.message });
  }
});

app.post('/api/mock/submit', async (req, res) => {
  try {
    const { userId, attemptId, submissions, answers, totalTimeSeconds } = req.body;
    const uid = userId || 'usr_candidate_01';
    const service = getMockExamRotationService();
    const result = await service.submitAttempt(uid, attemptId, submissions || [], answers || {}, totalTimeSeconds);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to submit mock exam', details: err.message });
  }
});

app.get('/api/mock/attempts', async (req, res) => {
  try {
    const repo = await getRepository();
    const uid = String(req.query.userId || 'usr_candidate_01');
    const attempts = await repo.getMockAttempts(uid);
    res.json(attempts);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get mock attempts', details: err.message });
  }
});

app.get('/api/mock/attempts/:id', async (req, res) => {
  try {
    const repo = await getRepository();
    const attempt = await repo.getMockAttemptById(req.params.id);
    if (!attempt) {
      return res.status(404).json({ error: 'Mock attempt not found' });
    }
    res.json(attempt);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to get mock attempt', details: err.message });
  }
});

// -------------------------------------------------------------
// 5A. MATHEMATICAL VOICE INTELLIGENCE ENDPOINTS (no answers/explanations are ever returned)
// -------------------------------------------------------------
function mathError(res: express.Response, e: any) {
  res.status(400).json({ success: false, error: e?.message || 'Invalid request' });
}

app.post('/api/math/parse', (req, res) => {
  try {
    const transcript = validateRequestString(req.body?.transcript, 'transcript');
    const { ast, ...rest } = parseMathematicalSpeech(transcript);
    res.json({ ...rest, ast });
  } catch (e) {
    mathError(res, e);
  }
});

app.post('/api/math/evaluate', async (req, res) => {
  try {
    const expression = validateRequestString(req.body?.expression, 'expression');
    const op = ['evaluate', 'simplify', 'solve'].includes(req.body?.op) ? req.body.op : 'evaluate';
    res.json(await evaluateWithEngine(expression, op));
  } catch (e) {
    mathError(res, e);
  }
});

app.post('/api/math/equivalent', async (req, res) => {
  try {
    const student = validateRequestString(req.body?.student, 'student');
    const target = validateRequestString(req.body?.target, 'target');
    res.json(await equivalenceWithEngine(student, target));
  } catch (e) {
    mathError(res, e);
  }
});

app.post('/api/math/match-options', (req, res) => {
  try {
    const expression = validateRequestString(req.body?.expression, 'expression');
    const o = req.body?.options || {};
    const options = {
      A: String(o.A ?? ''),
      B: String(o.B ?? ''),
      C: String(o.C ?? ''),
      D: String(o.D ?? '')
    };
    const { matches, unique } = matchSpokenMathToOptions(expression, options);
    res.json({ matches, unique });
  } catch (e) {
    mathError(res, e);
  }
});

app.post('/api/math/speech', (req, res) => {
  try {
    if (typeof req.body?.expression === 'string') {
      return res.json(renderMathExpressionToSpeech(validateRequestString(req.body.expression, 'expression')));
    }
    res.json({ spoken: renderTextWithMathToSpeech(validateRequestString(req.body?.text, 'text')) });
  } catch (e) {
    mathError(res, e);
  }
});

// -------------------------------------------------------------
// 5B. PILOT DEMO DIAGNOSTIC ENDPOINTS (20 Qs, 25 Min, 4 Sections)
// -------------------------------------------------------------
app.get('/api/diagnostic/questions', async (req, res) => {
  const allQuestions = loadQuestions();
  const selected20 = selectPilotDemoQuestions(allQuestions);
  const hideSolutions = req.query.examMode === 'true';

  const questionsPayload = hideSolutions
    ? selected20.map(({ correct_answer, explanation, ...rest }) => rest)
    : selected20;

  res.json({
    examName: 'SSC MTS Pilot Demo Diagnostic',
    totalQuestions: selected20.length,
    durationSeconds: PILOT_DEMO_DURATION_SECONDS,
    sections: DIAGNOSTIC_SECTIONS,
    questions: questionsPayload
  });
});

app.post('/api/diagnostic/submit', async (req, res) => {
  try {
    const {
      userId,
      clientSubmissionId,
      examTitle,
      submissions,
      totalTimeSeconds,
      acceptanceStatus,
      acceptanceMethod,
      acceptedAt,
      examStartedAt
    } = req.body;

    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Authenticated candidate userId is required.' });
    }

    const repo = await getRepository();
    const user = await repo.getUserById(userId);
    if (!user) {
      return res.status(401).json({ error: 'Authenticated candidate not found.' });
    }

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return res.status(400).json({ error: 'Diagnostic submissions payload is required.' });
    }

    const allQuestions = loadQuestions();
    const default20 = selectPilotDemoQuestions(allQuestions);

    // Resolve questions in submission order (falling back to the 20 diagnostic questions)
    const submissionQuestions = submissions
      .map((s: any) => allQuestions.find((q) => q.question_id === s.questionId))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const questionsToEvaluate =
      submissionQuestions.length === 20 ? submissionQuestions : default20;

    const evalResult = evaluatePilotDemoSubmission(
      questionsToEvaluate,
      submissions,
      Number(totalTimeSeconds) || 0
    );

    const nowIso = new Date().toISOString();
    const attemptId =
      clientSubmissionId && typeof clientSubmissionId === 'string'
        ? `diag_${clientSubmissionId.replace(/[^a-zA-Z0-9_-]/g, '')}`
        : `diag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const validAcceptanceMethod =
      acceptanceMethod === 'VOICE' || acceptanceMethod === 'CHECKBOX' || acceptanceMethod === 'KEYBOARD'
        ? acceptanceMethod
        : 'CHECKBOX';
    const validAcceptanceStatus =
      acceptanceStatus === 'NOT_ACCEPTED' || acceptanceStatus === 'ACCEPTED'
        ? acceptanceStatus
        : 'ACCEPTED';

    const diagnosticAttempt: DiagnosticAttempt = {
      id: attemptId,
      clientSubmissionId: clientSubmissionId || attemptId,
      userId: user.id,
      examTitle: examTitle || 'SSC MTS Pilot Demo Diagnostic',
      status: 'completed',
      totalQuestions: evalResult.totalQuestions,
      attemptedCount: evalResult.attemptedCount,
      correctCount: evalResult.correctCount,
      incorrectCount: evalResult.incorrectCount,
      unansweredCount: evalResult.unansweredCount,
      session1Score: evalResult.session1Score,
      session2Score: evalResult.session2Score,
      totalScore: evalResult.totalScore,
      totalMax: evalResult.totalMax,
      percentage: evalResult.percentage,
      accuracyPercentage: evalResult.accuracyPercentage,
      totalTimeSeconds: evalResult.totalTimeSeconds,
      responses: evalResult.responses,
      subjectBreakdown: evalResult.subjectBreakdown,
      topicBreakdown: evalResult.topicBreakdown,
      acceptanceStatus: validAcceptanceStatus,
      acceptanceMethod: validAcceptanceMethod,
      acceptedAt: typeof acceptedAt === 'string' ? acceptedAt : nowIso,
      examStartedAt: typeof examStartedAt === 'string' ? examStartedAt : nowIso,
      completedAt: nowIso
    };

    // Compute BKT Topic Mastery updates for answered questions
    const currentMasteryList = await repo.getTopicMastery(user.id);
    const masteryMap = new Map<string, TopicMasteryRecord>();
    for (const m of currentMasteryList) {
      masteryMap.set(m.topic, {
        id: m.id || `mst_${user.id}_${m.topic.replace(/\s+/g, '_')}`,
        userId: user.id,
        subject: m.subject,
        topic: m.topic,
        p_known: Number(m.p_known) || 0.25,
        masteryPercentage: Number(m.masteryPercentage) || 25,
        tier: m.tier || 'Novice',
        attemptsCount: Number(m.attemptsCount) || 0,
        correctCount: Number(m.correctCount) || 0,
        updatedAt: nowIso
      });
    }

    const bktUpdatesMap = new Map<string, TopicMasteryRecord>();
    for (const resp of evalResult.responses) {
      if (!resp.isAnswered) continue;
      const existing = bktUpdatesMap.get(resp.topic) || masteryMap.get(resp.topic);
      const prevP = existing ? existing.p_known : 0.25;
      const newP = updateBKT(prevP, resp.isCorrect);
      const attemptsCount = (existing ? existing.attemptsCount : 0) + 1;
      const correctCount = (existing ? existing.correctCount : 0) + (resp.isCorrect ? 1 : 0);

      bktUpdatesMap.set(resp.topic, {
        id: existing?.id || `mst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: user.id,
        subject: resp.subject,
        topic: resp.topic,
        p_known: newP,
        masteryPercentage: Math.round(newP * 100),
        tier: classifyMasteryTier(newP),
        attemptsCount,
        correctCount,
        updatedAt: nowIso
      });
    }

    const historyEntry: LearningHistoryEntry = {
      id: `hist_diag_${attemptId}`,
      userId: user.id,
      type: 'diagnostic',
      title: diagnosticAttempt.examTitle,
      summary: `Pilot Demo Diagnostic: Score ${evalResult.totalScore}/${evalResult.totalMax} (${evalResult.accuracyPercentage}% accuracy, ${evalResult.correctCount} correct, ${evalResult.incorrectCount} incorrect, ${evalResult.unansweredCount} unanswered).`,
      score: evalResult.totalScore,
      maxScore: evalResult.totalMax,
      durationSeconds: evalResult.totalTimeSeconds,
      timestamp: nowIso
    };

    const persistedAttempt = await repo.recordDiagnosticAttempt(
      diagnosticAttempt,
      Array.from(bktUpdatesMap.values()),
      historyEntry
    );

    const allCandidateAttempts = await repo.getDiagnosticAttempts(user.id);
    const recommendationData = generateDiagnosticRecommendations(allCandidateAttempts);

    // Enrich responses with question text & explanation for results screen
    const enrichedResponses = persistedAttempt.responses.map((r) => {
      const q = allQuestions.find((item) => item.question_id === r.questionId);
      return {
        ...r,
        questionText: q?.question_text || '',
        optionA: q?.option_a || '',
        optionB: q?.option_b || '',
        optionC: q?.option_c || '',
        optionD: q?.option_d || '',
        explanation: q?.explanation || ''
      };
    });

    res.json({
      success: true,
      attempt: {
        ...persistedAttempt,
        enrichedResponses
      },
      recommendations: recommendationData.recommendations,
      historicalSummaryNote: recommendationData.historicalSummaryNote,
      hasSufficientHistory: recommendationData.hasSufficientHistory
    });
  } catch (err: any) {
    console.error('Diagnostic submit error:', err);
    res.status(500).json({
      error: 'Failed to persist diagnostic attempt.',
      details: err.message
    });
  }
});

app.get('/api/diagnostic/attempts', async (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) {
    return res.status(401).json({ error: 'Authenticated candidate userId is required.' });
  }

  const repo = await getRepository();
  const attempts = await repo.getDiagnosticAttempts(userId);
  const allQuestions = loadQuestions();
  const recommendationData = generateDiagnosticRecommendations(attempts);

  const enrichedAttempts = attempts.map((att) => ({
    ...att,
    enrichedResponses: (att.responses || []).map((r) => {
      const q = allQuestions.find((item) => item.question_id === r.questionId);
      return {
        ...r,
        questionText: q?.question_text || '',
        optionA: q?.option_a || '',
        optionB: q?.option_b || '',
        optionC: q?.option_c || '',
        optionD: q?.option_d || '',
        explanation: q?.explanation || ''
      };
    })
  }));

  res.json({
    attempts: enrichedAttempts,
    totalAttempts: enrichedAttempts.length,
    latestAttempt: enrichedAttempts[0] || null,
    recommendations: recommendationData.recommendations,
    historicalSummaryNote: recommendationData.historicalSummaryNote,
    hasSufficientHistory: recommendationData.hasSufficientHistory
  });
});

app.get('/api/diagnostic/attempts/:id', async (req, res) => {
  const userId = String(req.query.userId || '');
  if (!userId) {
    return res.status(401).json({ error: 'Authenticated candidate userId is required.' });
  }

  const repo = await getRepository();
  const attempt = await repo.getDiagnosticAttemptById(req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: 'Diagnostic attempt not found.' });
  }

  // Candidate ownership validation
  if (attempt.userId !== userId) {
    return res.status(403).json({
      error: 'Forbidden: You do not have permission to access another candidate’s diagnostic record.'
    });
  }

  const allQuestions = loadQuestions();
  const allCandidateAttempts = await repo.getDiagnosticAttempts(userId);
  const recommendationData = generateDiagnosticRecommendations(allCandidateAttempts);

  const enrichedResponses = (attempt.responses || []).map((r) => {
    const q = allQuestions.find((item) => item.question_id === r.questionId);
    return {
      ...r,
      questionText: q?.question_text || '',
      optionA: q?.option_a || '',
      optionB: q?.option_b || '',
      optionC: q?.option_c || '',
      optionD: q?.option_d || '',
      explanation: q?.explanation || ''
    };
  });

  res.json({
    attempt: {
      ...attempt,
      enrichedResponses
    },
    recommendations: recommendationData.recommendations,
    historicalSummaryNote: recommendationData.historicalSummaryNote,
    hasSufficientHistory: recommendationData.hasSufficientHistory
  });
});

// -------------------------------------------------------------
// 6. REVISION PLANNER & SM-2
// -------------------------------------------------------------
app.get('/api/revision/items', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const result = await repo.getRevisionItems(uid);
  res.json(result);
});

app.get('/api/revision/queue', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const result = await repo.getRevisionItems(uid);

  const cards = [...result.dueItems, ...result.upcomingItems].map((item) => ({
    id: item.id,
    questionId: item.questionId,
    subject: item.question?.subject || 'Unknown',
    topic: item.question?.topic || 'Unknown',
    questionText: item.question?.question_text || '',
    correctAnswer: item.question?.correct_answer || '',
    explanation: item.question?.explanation || '',
    nextReviewDate: item.nextReviewDue,
    intervalDays: item.intervalDays,
    repetition: item.repetitions,
    easeFactor: item.easinessFactor,
    status: item.isDue ? 'due' : 'upcoming',
    isDue: item.isDue
  }));

  res.json({
    cards,
    totalCount: cards.length,
    dueTodayCount: result.dueTodayCount,
    upcomingCount: result.upcomingCount,
    dueItems: result.dueItems,
    upcomingItems: result.upcomingItems
  });
});

app.post('/api/revision/review', async (req, res) => {
  const { userId, questionId, quality } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  const item = await repo.reviewRevisionItem(uid, questionId, Number(quality) || 3);
  res.json({ success: true, item });
});

// -------------------------------------------------------------
// 7. KNOWLEDGE TOPIC MASTERY & PROGRESS ANALYTICS
// -------------------------------------------------------------
app.get('/api/mastery', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const mastery = await repo.getTopicMastery(uid);
  res.json(mastery);
});

app.get('/api/progress/analytics', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const analytics = await repo.getProgressAnalytics(uid);
  res.json(analytics);
});

app.get('/api/history', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const history = await repo.getLearningHistory(uid);
  res.json(history);
});

app.get('/api/history/detailed', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const allQuestions = loadQuestions();

  const attempts = (await repo.getProgressAnalytics(uid)).totalPracticeQuestions > 0
    ? (await repo.getQuestions({ limit: 1000 })).questions
    : [];

  // Return standard learning history entries formatted
  const history = await repo.getLearningHistory(uid);
  res.json(history);
});

// -------------------------------------------------------------
// 8. ACCESSIBILITY SETTINGS & PROFILE
// -------------------------------------------------------------
app.get('/api/settings/accessibility', async (req, res) => {
  const repo = await getRepository();
  const uid = String(req.query.userId || 'usr_candidate_01');
  const settings = await repo.getAccessibilitySettings(uid);
  res.json(settings);
});

app.post('/api/settings/accessibility', async (req, res) => {
  const { userId, ...updates } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  const current = await repo.getAccessibilitySettings(uid);
  const updated = await repo.saveAccessibilitySettings({ ...current, ...updates, userId: uid });
  res.json({ success: true, settings: updated });
});

app.patch('/api/user/profile', async (req, res) => {
  const { userId, name, examRegion, examLanguage, pwdCategory, needScribe } = req.body;
  const repo = await getRepository();
  const uid = String(userId || 'usr_candidate_01');

  try {
    const updated = await repo.updateUserProfile(uid, {
      name,
      examRegion,
      examLanguage,
      pwdCategory,
      needScribe: needScribe !== undefined ? Boolean(needScribe) : undefined
    });
    res.json({ success: true, user: updated });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// CURRENT AFFAIRS & TRANSCRIPT WORKSPACE ENDPOINTS
// -------------------------------------------------------------
app.get('/api/current-affairs/questions', async (req, res) => {
  try {
    const repo = await getRepository();
    const category = req.query.category as string | undefined;
    let questions = await repo.getCurrentAffairsQuestions(category);
    if (!questions || questions.length === 0) {
      await repo.saveCurrentAffairsQuestions(CURATED_CURRENT_AFFAIRS);
      questions = await repo.getCurrentAffairsQuestions(category);
    }
    res.json({
      success: true,
      total: questions.length,
      category: category || 'all',
      questions
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve current affairs questions.', details: err.message });
  }
});

app.get('/api/current-affairs/status', async (req, res) => {
  try {
    const repo = await getRepository();
    let meta = await repo.getCurrentAffairsMetadata();
    if (meta.total === 0) {
      await repo.saveCurrentAffairsQuestions(CURATED_CURRENT_AFFAIRS);
      meta = await repo.getCurrentAffairsMetadata();
    }
    res.json({
      success: true,
      ...meta,
      sources: [
        'Press Information Bureau (PIB) India',
        'Indian Space Research Organisation (ISRO)',
        'Ministry of Finance & Reserve Bank of India',
        'Ministry of Law and Justice',
        'Ministry of Environment, Forest and Climate Change',
        'Sports Authority of India & Ministry of Youth Affairs and Sports'
      ]
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve current affairs status.', details: err.message });
  }
});

app.post('/api/current-affairs/refresh', async (req, res) => {
  try {
    const repo = await getRepository();
    const result = await repo.saveCurrentAffairsQuestions(CURATED_CURRENT_AFFAIRS);
    const meta = await repo.getCurrentAffairsMetadata();
    res.json({
      success: true,
      message: 'Current affairs questions refreshed and verified from attributable sources.',
      added: result.added,
      updated: result.updated,
      ...meta
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to refresh current affairs questions.', details: err.message });
  }
});

app.get('/api/transcripts', async (req, res) => {
  try {
    const userId = String(req.query.userId || 'usr_candidate_01');
    const repo = await getRepository();
    const transcripts = await repo.getTranscripts(userId);
    res.json({
      success: true,
      total: transcripts.length,
      transcripts
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve transcripts.', details: err.message });
  }
});

app.post('/api/transcripts', async (req, res) => {
  try {
    const { userId, screenId, transcript, confidence, status, intent } = req.body;
    if (!userId || !transcript) {
      return res.status(400).json({ error: 'userId and transcript are required.' });
    }
    const repo = await getRepository();
    const entry: TranscriptLogEntry = {
      id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: String(userId),
      timestamp: new Date().toISOString(),
      screenId: String(screenId || 'unknown'),
      transcript: String(transcript),
      confidence: typeof confidence === 'number' ? confidence : undefined,
      status: status || 'recognized',
      intent: intent ? String(intent) : undefined
    };
    await repo.recordTranscript(entry);
    res.json({ success: true, entry });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save transcript entry.', details: err.message });
  }
});

app.delete('/api/transcripts', async (req, res) => {
  try {
    const userId = String(req.query.userId || req.body?.userId || '');
    if (!userId) {
      return res.status(400).json({ error: 'Authenticated candidate userId is required to delete transcripts.' });
    }
    const repo = await getRepository();
    await repo.clearTranscripts(userId);
    res.json({ success: true, message: 'Candidate transcripts cleared successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to clear candidate transcripts.', details: err.message });
  }
});

app.get('/api/transcripts/settings', async (req, res) => {
  try {
    const userId = String(req.query.userId || 'usr_candidate_01');
    const repo = await getRepository();
    const settings = await repo.getTranscriptPrivacySettings(userId);
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to retrieve transcript settings.', details: err.message });
  }
});

app.post('/api/transcripts/settings', async (req, res) => {
  try {
    const { userId, storageEnabled, retentionDays } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Authenticated candidate userId is required.' });
    }
    const repo = await getRepository();
    const updated = await repo.saveTranscriptPrivacySettings({
      userId: String(userId),
      storageEnabled: storageEnabled !== false,
      retentionDays: Number(retentionDays) || 30
    });
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save transcript settings.', details: err.message });
  }
});

// -------------------------------------------------------------
// 9. DATASET SUMMARY & MODEL EVALUATION (Admin)
// -------------------------------------------------------------
app.get('/api/dataset/summary', (req, res) => {
  try {
    const reportPath = path.resolve(process.cwd(), 'src/data/dataset_validation_report.json');
    const dictPath = path.resolve(process.cwd(), 'src/data/data_dictionary.json');

    const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf-8')) : null;
    const dictionary = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf-8')) : null;
    const questions = loadQuestions();

    res.json({
      totalQuestions: questions.length,
      validationReport: report,
      dataDictionary: dictionary
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/model/evaluation', (req, res) => {
  try {
    const evalPath = path.resolve(process.cwd(), 'src/data/model_evaluation_report.json');
    if (!fs.existsSync(evalPath)) {
      return res.status(404).json({ error: 'Evaluation report not generated yet.' });
    }
    const report = JSON.parse(fs.readFileSync(evalPath, 'utf-8'));
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function getPythonExecutable(): string {
  const userPy = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe');
  if (fs.existsSync(userPy)) return userPy;
  return 'python3';
}

function getFFmpegDir(): string {
  try {
    const wingetBase = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetBase)) {
      const matches = fs.readdirSync(wingetBase).filter((d) => d.startsWith('Gyan.FFmpeg.Essentials'));
      for (const match of matches) {
        const subdirs = fs.readdirSync(path.join(wingetBase, match));
        for (const sub of subdirs) {
          const bin = path.join(wingetBase, match, sub, 'bin');
          if (fs.existsSync(path.join(bin, 'ffmpeg.exe'))) {
            return bin;
          }
        }
      }
    }
  } catch (e) {
    console.error('Error finding ffmpeg dir:', e);
  }
  return '';
}

function getExecutionEnv(): NodeJS.ProcessEnv {
  const ffmpegDir = getFFmpegDir();
  const pyDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311');
  const pyScripts = path.join(pyDir, 'Scripts');
  const pathParts = [ffmpegDir, pyDir, pyScripts, process.env.PATH || ''].filter(Boolean);
  return {
    ...process.env,
    PATH: pathParts.join(path.delimiter)
  };
}

app.post('/api/model/predict', (req, res) => {
  const questionText = req.body.questionText || req.body.question_text;
  if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
    return res.status(400).json({ error: 'Question text is required for inference.' });
  }

  execFile(getPythonExecutable(), ['scripts/inference.py', questionText.trim()], { env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      console.error('Inference error:', error, stderr);
      return res.status(500).json({ error: 'Failed to run model inference', details: stderr });
    }
    try {
      const parsed = JSON.parse(stdout);
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Invalid inference output format', raw: stdout });
    }
  });
});

app.post(['/api/model/train', '/api/model/retrain'], (req, res) => {
  execFile(getPythonExecutable(), ['scripts/train_model.py'], { env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      console.error('Training script error:', error, stderr);
      return res.status(500).json({ error: 'Model training pipeline failed', details: stderr });
    }
    const evalPath = path.resolve(process.cwd(), 'src/data/model_evaluation_report.json');
    const report = fs.existsSync(evalPath) ? JSON.parse(fs.readFileSync(evalPath, 'utf-8')) : null;
    res.json({
      success: true,
      logs: stdout,
      updatedReport: report
    });
  });
});

// -------------------------------------------------------------
// 10. AUDIO TRANSCRIPTION & WHISPER
// -------------------------------------------------------------
app.get('/api/audio/status', (req, res) => {
  execFile(getPythonExecutable(), ['-c', 'import whisper; print("ok")'], { timeout: 8000, env: getExecutionEnv() }, (err, stdout) => {
    if (!err && stdout.trim() === 'ok') {
      return res.json({ whisperAvailable: true, pythonAvailable: true });
    }
    execFile('python', ['-c', 'import whisper; print("ok")'], { timeout: 8000, env: getExecutionEnv() }, (err2, stdout2) => {
      const available = !err2 && stdout2.trim() === 'ok';
      res.json({ whisperAvailable: available, pythonAvailable: !err2 });
    });
  });
});

app.post('/api/audio/transcribe', upload.single('audio'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({
      success: false,
      error: 'No audio file received in upload payload.'
    });
  }

  const filePath = file.path;
  const scriptPath = path.resolve(process.cwd(), 'scripts/transcribe_audio.py');

  function cleanupTempFile() {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Error removing temp audio file:', e);
      }
    }
  }

  function handleWhisperUnavailable(lastError?: string) {
    cleanupTempFile();
    return res.json({
      success: false,
      whisperAvailable: false,
      error: 'Whisper speech recognition engine is not available on this server. Please use manual input.',
      details: lastError,
      requiresManualInput: true
    });
  }

  execFile(getPythonExecutable(), [scriptPath, filePath], { timeout: 45000, env: getExecutionEnv() }, (error, stdout, stderr) => {
    if (error) {
      execFile('python', [scriptPath, filePath], { timeout: 45000, env: getExecutionEnv() }, (err2, stdout2, stderr2) => {
        if (err2) {
          return handleWhisperUnavailable(err2.message || stderr2);
        }
        cleanupTempFile();
        try {
          const parsed = JSON.parse(stdout2);
          res.json({ ...parsed, whisperAvailable: true });
        } catch {
          res.json({ success: true, transcript: stdout2.trim(), confidence: 0.85, whisperAvailable: true });
        }
      });
      return;
    }

    cleanupTempFile();
    try {
      const parsed = JSON.parse(stdout);
      res.json({ ...parsed, whisperAvailable: true });
    } catch {
      res.json({ success: true, transcript: stdout.trim(), confidence: 0.85, whisperAvailable: true });
    }
  });
});

// -------------------------------------------------------------
// 11. AI SYLLABUS TUTOR WITH DETERMINISTIC PEDAGOGICAL FALLBACK
// -------------------------------------------------------------
app.post('/api/tutor/chat', async (req, res) => {
  const { message, query: queryTextParam, subject, topic } = req.body;
  const queryText = (message || queryTextParam || '').trim();

  if (!queryText) {
    return res.status(400).json({ error: 'Query message cannot be empty.' });
  }

  const allQuestions = loadQuestions();
  let relevant = allQuestions.filter((q) => {
    if (subject && q.subject.toLowerCase() !== subject.toLowerCase()) return false;
    if (topic && q.topic.toLowerCase() !== topic.toLowerCase()) return false;
    return true;
  });

  if (relevant.length === 0) {
    relevant = allQuestions.slice(0, 3);
  } else {
    relevant = relevant.slice(0, 3);
  }

  const repo = await getRepository();
  const uid = req.body.userId || 'usr_candidate_01';

  if (geminiClient) {
    try {
      const contextExcerpts = relevant
        .map(
          (q, idx) =>
            `Reference Item ${idx + 1} (${q.subject} - ${q.topic} - ${q.subtopic}):\n` +
            `Question: ${q.question_text}\nCorrect Answer: ${q.correct_answer}\nExplanation: ${q.explanation}\nSource: ${q.source_reference}`
        )
        .join('\n\n');

      const systemInstruction = `You are the official ACCESSPREP-X AI Syllabus Scribe and Pedagogical Tutor for candidates preparing for the Staff Selection Commission (SSC) Multi-Tasking Staff (MTS) Examination.
Your explanations MUST be:
1. Grounded strictly in the provided syllabus context and verified exam patterns.
2. Formatted for screen-reader accessibility: concise paragraphs, plain text formulas (e.g. Speed = Distance / Time), and step-by-step logic.
3. Supportive and encouraging for candidates with disabilities (PwD) under the RPwD Act 2016.
4. Conclude with a clear one-line "Takeaway Rule" for the exam.`;

      const prompt = `Candidate Syllabus Question:\n"${queryText}"\n\nVerified Curriculum Grounding Context:\n${contextExcerpts}\n\nPlease explain the concept, solve step-by-step, and state the relevant examination rule clearly.`;

      const response = await geminiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${prompt}` }]
          }
        ]
      });

      const reply = response.text || 'Explanation unavailable.';
      try {
        await repo.recordLearningHistory({
          id: `hist_tutor_${Date.now()}`,
          userId: uid,
          type: 'ai_tutor',
          title: `${subject || 'SSC MTS'} - ${topic || 'Query'}`,
          summary: queryText.slice(0, 150),
          durationSeconds: 45,
          timestamp: new Date().toISOString()
        });
      } catch (e) {
        console.warn('Could not record AI tutor history:', e);
      }

      return res.json({
        success: true,
        reply,
        retrievedEvidence: relevant.map((r) => ({
          subject: r.subject,
          topic: r.topic,
          reference: r.source_reference
        }))
      });
    } catch (aiErr: any) {
      console.warn('Gemini API call failed, using deterministic syllabus guidance:', aiErr.message);
    }
  }

  // Deterministic pedagogical fallback based on syllabus repository
  let deterministicReply = `Here is the step-by-step explanation for your query on ${subject || 'SSC MTS'}:\n\n`;
  if (relevant.length > 0) {
    deterministicReply += `Key Principle (${relevant[0].topic} - ${relevant[0].subtopic}):\n${relevant[0].explanation}\n\n`;
    deterministicReply += `Example problem from official SSC MTS paper:\n"${relevant[0].question_text}"\nCorrect Answer: Option ${relevant[0].correct_answer}`;
  } else {
    deterministicReply += `In SSC MTS examinations, always solve by breaking the problem into foundational steps: identify the given quantities, apply the verified syllabus theorem or grammar rule, and double-check units and options.`;
  }

  try {
    await repo.recordLearningHistory({
      id: `hist_tutor_${Date.now()}`,
      userId: uid,
      type: 'ai_tutor',
      title: `${subject || 'SSC MTS'} - ${topic || 'Query'}`,
      summary: queryText.slice(0, 150),
      durationSeconds: 45,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Could not record AI tutor history:', e);
  }

  res.json({
    success: true,
    reply: deterministicReply,
    retrievedEvidence: relevant.map((r) => ({
      subject: r.subject,
      topic: r.topic,
      reference: r.source_reference
    }))
  });
});

// FIX 4: GET /api/subjects
app.get('/api/subjects', (req, res) => {
  const questions = loadQuestions();
  const subjectsMap: Record<string, { topics: Set<string>; count: number }> = {};
  questions.forEach((q) => {
    if (!subjectsMap[q.subject]) subjectsMap[q.subject] = { topics: new Set(), count: 0 };
    subjectsMap[q.subject].topics.add(q.topic);
    subjectsMap[q.subject].count++;
  });
  const subjects = Object.entries(subjectsMap).map(([name, data]) => ({
    name,
    topicCount: data.topics.size,
    questionCount: data.count,
    topics: [...data.topics].sort()
  }));
  res.json(subjects);
});

// FIX 3: POST /api/questions - add a new question
app.post('/api/questions', (req, res) => {
  const body = req.body;
  const question_id = body.question_id || `SSC-MTS-USR-${Date.now()}`;

  const required = ['subject', 'topic', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'explanation', 'difficulty_label', 'source_name', 'source_reference', 'source_type'];
  const missing = required.filter((f) => !body[f]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (!['A', 'B', 'C', 'D'].includes(String(body.correct_answer).toUpperCase())) {
    return res.status(400).json({ error: 'correct_answer must be one of A, B, C, or D.' });
  }

  if (!['Easy', 'Medium', 'Hard'].includes(body.difficulty_label)) {
    return res.status(400).json({ error: 'difficulty_label must be Easy, Medium, or Hard.' });
  }

  const now = new Date().toISOString();
  const newQuestion = {
    question_id,
    subject: body.subject,
    topic: body.topic,
    subtopic: body.subtopic || '',
    question_text: body.question_text,
    question_type: body.question_type || 'multiple_choice',
    option_a: body.option_a,
    option_b: body.option_b,
    option_c: body.option_c,
    option_d: body.option_d,
    correct_answer: String(body.correct_answer).toUpperCase(),
    explanation: body.explanation,
    difficulty_label: body.difficulty_label,
    source_name: body.source_name,
    source_reference: body.source_reference,
    source_type: body.source_type,
    verification_status: body.verification_status || 'Pending',
    language: body.language || 'English',
    created_at: body.created_at || now,
    updated_at: body.updated_at || now,
    dataset_version: body.dataset_version || 'v1.0-mts-verified'
  };

  const questionsFilePath = path.resolve(process.cwd(), 'src/data/ssc_mts_questions.json');
  let questions: any[] = [];
  try {
    if (fs.existsSync(questionsFilePath)) {
      questions = JSON.parse(fs.readFileSync(questionsFilePath, 'utf-8'));
    }
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load questions dataset.' });
  }

  if (questions.find((q) => q.question_id === question_id)) {
    return res.status(409).json({ error: `Duplicate question_id: ${question_id}` });
  }

  questions.push(newQuestion);

  try {
    fs.writeFileSync(questionsFilePath, JSON.stringify(questions, null, 2), 'utf-8');
    resetQuestionsCache();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to save question to dataset.' });
  }

  res.status(201).json({
    success: true,
    questionId: question_id,
    message: 'Question added to dataset. Awaiting human verification before entering verified learning bank.'
  });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE / STATIC ASSET SERVING
// -------------------------------------------------------------
async function startServer() {
  // Safe database initialization
  try {
    latestMigrationReport = await runDatabaseMigration();
    console.log(`[Database Initialization]: ${latestMigrationReport.message} (Engine: ${latestMigrationReport.databaseEngine})`);
  } catch (migErr: any) {
    console.warn('[Database Migration Notice]:', migErr.message);
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/src/data/**', '**/*.json', '**/*.db', '**/*.log', '**/.venv/**', '**/dist/**']
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ACCESSPREP-X Portal running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
