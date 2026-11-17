/**
 * ACCESSPREP-X — ML Dataset, Model Evaluation & Whisper Audio Controllers
 */

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { Request, Response } from 'express';
import { loadQuestions } from '../repositories/index.ts';
import {
  getPythonExecutable,
  getExecutionEnv
} from '../utils/pythonRunner.utils.ts';

export function getDatasetSummary(_req: Request, res: Response) {
  try {
    const reportPath = path.resolve(process.cwd(), 'src/data/dataset_validation_report.json');
    const dictPath = path.resolve(process.cwd(), 'src/data/data_dictionary.json');

    const report = fs.existsSync(reportPath)
      ? JSON.parse(fs.readFileSync(reportPath, 'utf-8'))
      : null;
    const dictionary = fs.existsSync(dictPath)
      ? JSON.parse(fs.readFileSync(dictPath, 'utf-8'))
      : null;
    const questions = loadQuestions();

    res.json({
      totalQuestions: questions.length,
      validationReport: report,
      dataDictionary: dictionary
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export function getModelEvaluation(_req: Request, res: Response) {
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
}

export function postModelPredict(req: Request, res: Response) {
  const questionText = req.body.questionText || req.body.question_text;
  if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
    return res.status(400).json({ error: 'Question text is required for inference.' });
  }

  execFile(
    getPythonExecutable(),
    ['scripts/inference.py', questionText.trim()],
    { env: getExecutionEnv() },
    (error, stdout, stderr) => {
      if (error) {
        console.error('Inference error:', error, stderr);
        return res.status(500).json({ error: 'Failed to run model inference', details: stderr });
      }
      try {
        const parsed = JSON.parse(stdout);
        res.json(parsed);
      } catch {
        res.status(500).json({ error: 'Invalid inference output format', raw: stdout });
      }
    }
  );
}

export function postModelTrain(_req: Request, res: Response) {
  execFile(
    getPythonExecutable(),
    ['scripts/train_model.py'],
    { env: getExecutionEnv() },
    (error, stdout, stderr) => {
      if (error) {
        console.error('Training script error:', error, stderr);
        return res.status(500).json({ error: 'Model training pipeline failed', details: stderr });
      }
      const evalPath = path.resolve(process.cwd(), 'src/data/model_evaluation_report.json');
      const report = fs.existsSync(evalPath)
        ? JSON.parse(fs.readFileSync(evalPath, 'utf-8'))
        : null;
      res.json({
        success: true,
        logs: stdout,
        updatedReport: report
      });
    }
  );
}

export function getAudioStatus(_req: Request, res: Response) {
  execFile(
    getPythonExecutable(),
    ['-c', 'import whisper; print("ok")'],
    { timeout: 8000, env: getExecutionEnv() },
    (err, stdout) => {
      if (!err && stdout.trim() === 'ok') {
        return res.json({ whisperAvailable: true, pythonAvailable: true });
      }
      execFile(
        'python',
        ['-c', 'import whisper; print("ok")'],
        { timeout: 8000, env: getExecutionEnv() },
        (err2, stdout2) => {
          const available = !err2 && stdout2.trim() === 'ok';
          res.json({ whisperAvailable: available, pythonAvailable: !err2 });
        }
      );
    }
  );
}

export function postAudioTranscribe(req: Request, res: Response) {
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
      error:
        'Whisper speech recognition engine is not available on this server. Please use manual input.',
      details: lastError,
      requiresManualInput: true
    });
  }

  execFile(
    getPythonExecutable(),
    [scriptPath, filePath],
    { timeout: 45000, env: getExecutionEnv() },
    (error, stdout, stderr) => {
      if (error) {
        execFile(
          'python',
          [scriptPath, filePath],
          { timeout: 45000, env: getExecutionEnv() },
          (err2, stdout2, stderr2) => {
            if (err2) {
              return handleWhisperUnavailable(err2.message || stderr2);
            }
            cleanupTempFile();
            try {
              const parsed = JSON.parse(stdout2);
              res.json({ ...parsed, whisperAvailable: true });
            } catch {
              res.json({
                success: true,
                transcript: stdout2.trim(),
                confidence: 0.85,
                whisperAvailable: true
              });
            }
          }
        );
        return;
      }

      cleanupTempFile();
      try {
        const parsed = JSON.parse(stdout);
        res.json({ ...parsed, whisperAvailable: true });
      } catch {
        res.json({
          success: true,
          transcript: stdout.trim(),
          confidence: 0.85,
          whisperAvailable: true
        });
      }
    }
  );
}
