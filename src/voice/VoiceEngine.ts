/**
 * ACCESSPREP-X — Production Voice Engine
 * ============================================================
 * Robust, resilient Web Speech recognition engine tailored for
 * visually impaired and blind candidates.
 *
 * Key features:
 *  • Automatically requests browser audio permission via getUserMedia
 *  • Continuous recognition emulation with clean lifecycle transitions
 *  • Real-time speech interruption: Mic stays listening during TTS speech
 *    and immediately executes "STOP" / "Stop speaking" on ANY screen!
 *  • Transient error resilience (audio-capture, network, aborted, no-speech)
 *  • Echo-suppression: Non-stop transcripts are filtered out during TTS playback
 *  • Direct pipeline to NavigationController via onTranscript callback
 */

export interface VoiceEngineOptions {
  /** Dispatches transcript to the global NavigationController pipeline */
  onTranscript: (transcript: string) => Promise<void>;
  /** Notifies UI of microphone listening status */
  onListeningChange: (listening: boolean) => void;
  /** Immediately interrupts and halts active TTS speech */
  onStopSpeaking?: () => void;
  /** Notifies UI of microphone permission denial or unsupported speech recognition */
  onError?: (errorType: 'denied' | 'unsupported' | 'error', message: string) => void;
  /** Speech recognition language (defaults to 'en-IN') */
  lang?: string;
}

function isStopCommand(text: string): boolean {
  const t = text.toLowerCase().trim();
  const stops = [
    'stop',
    'stop speaking',
    'stop reading',
    'stop audio',
    'stop speech',
    'be quiet',
    'quiet',
    'silence',
    'shut up',
    'pause',
    'pause reading',
    'pause audio',
    'halt',
    'vision stop',
    'hey vision stop'
  ];
  return stops.some(
    (s) => t === s || t.startsWith(s + ' ') || t.endsWith(' ' + s) || t.includes(s)
  );
}

export class VoiceEngine {
  private opts: VoiceEngineOptions;
  private rec: any = null;
  private isAllowed: boolean = false;
  private isSpeaking: boolean = false;
  private isStarting: boolean = false;
  private isRunning: boolean = false;
  private isDestroyed: boolean = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private hasRequestedPermission: boolean = false;

  constructor(opts: VoiceEngineOptions) {
    this.opts = opts;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Start listening (called after login, or when candidate clicks mic / presses Alt+V) */
  async start(): Promise<void> {
    this.isAllowed = true;

    // First time in browser session: trigger getUserMedia to ensure native permission prompt appears
    if (!this.hasRequestedPermission && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        this.hasRequestedPermission = true;
        // Release tracks immediately so SpeechRecognition has uncontended access
        stream.getTracks().forEach((t) => t.stop());
      } catch (err: any) {
        console.warn('[VoiceEngine] getUserMedia error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          console.error('[VoiceEngine] Microphone access denied by user.');
          this.opts.onListeningChange(false);
          this.opts.onError?.('denied', 'Microphone permission denied. Please allow microphone access or use keyboard input.');
          return;
        }
      }
    }

    this._startRec();
  }

  /** Stop listening (e.g. on logout) */
  stop(): void {
    this.isAllowed = false;
    this._stopRec();
  }

  /** Inform engine whether TTS speech is currently playing */
  setSpeaking(speaking: boolean): void {
    this.isSpeaking = speaking;
  }

  /** Temporarily pause listening */
  pause(): void {
    this.isSpeaking = true;
  }

  /** Resume listening */
  resume(): void {
    this.isSpeaking = false;
    if (!this.isAllowed) return;

    if (!this.isRunning && !this.isStarting) {
      this._startRec();
    }
  }

  /** Free all resources */
  destroy(): void {
    this.isDestroyed = true;
    this.isAllowed = false;
    this._stopRec();
  }

  /** Whether the microphone is currently active */
  isListening(): boolean {
    return this.isRunning && this.isAllowed;
  }

  // ── Internal SpeechRecognition Engine ──────────────────────────────────────

  private _stopRec(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        /* ignore abort error on closed engine */
      }
      this.rec = null;
    }

    this.isRunning = false;
    this.isStarting = false;
    this.opts.onListeningChange(false);
  }

  private _startRec(): void {
    if (this.isDestroyed || !this.isAllowed || this.isStarting || this.isRunning) {
      return;
    }

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    if (typeof window === 'undefined') return;

    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRec) {
      console.warn('[VoiceEngine] Browser SpeechRecognition not supported.');
      this.opts.onError?.('unsupported', 'Speech recognition is not supported in this browser. Please use keyboard input.');
      return;
    }

    try {
      this.isStarting = true;
      const rec = new SpeechRec();

      // Continuous emulation mode: captures phrases cleanly without Chromium HAL deadlock
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = this.opts.lang || 'en-IN';
      rec.maxAlternatives = 3;

      rec.onstart = () => {
        this.isStarting = false;
        this.isRunning = true;
        this.opts.onListeningChange(true);
      };

      rec.onresult = (event: any) => {
        if (!this.isAllowed) return;

        const lastIdx = event.results.length - 1;
        const result = event.results[lastIdx];
        if (!result || !result[0]) return;

        const transcript = (result[0].transcript || '').trim();
        if (!transcript) return;

        // CRITICAL REQUIREMENT: If the system is currently speaking, ANY "stop" command halts speech immediately!
        if (this.isSpeaking) {
          if (isStopCommand(transcript)) {
            console.log('[VoiceEngine Speech Interrupted by Stop Command]:', transcript);
            this.isSpeaking = false;
            this.opts.onStopSpeaking?.();
          }
          // Ignore computer TTS echo during active speech
          return;
        }

        console.log('[VoiceEngine Heard]:', transcript);
        this.opts.onTranscript(transcript).catch((err) => {
          console.error('[VoiceEngine] Transcript handling error:', err);
        });
      };

      rec.onerror = (e: any) => {
        const error = e.error;

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          console.warn('[VoiceEngine] Mic permission not allowed.');
          this.isAllowed = false;
          this.opts.onListeningChange(false);
          this.opts.onError?.('denied', 'Microphone permission denied. Please allow microphone access or use keyboard input.');
          return;
        }

        // Transient audio contention error: wait 500ms and re-arm
        if (error === 'audio-capture') {
          console.warn('[VoiceEngine] Audio device busy. Scheduling restart...');
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.isStarting = false;
            this.isRunning = false;
            this._startRec();
          }, 600);
          return;
        }

        // Network or service glitches: retry in 800ms
        if (error === 'network') {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.isStarting = false;
            this.isRunning = false;
            this._startRec();
          }, 800);
          return;
        }

        // 'no-speech' and 'aborted' are normal lifecycle events handled in onend
      };

      rec.onend = () => {
        this.isRunning = false;
        this.isStarting = false;
        this.rec = null;
        this.opts.onListeningChange(false);

        // Auto-restart if candidate is still logged in
        if (!this.isDestroyed && this.isAllowed) {
          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this._startRec();
          }, 150);
        }
      };

      this.rec = rec;
      rec.start();
    } catch (err: any) {
      console.warn('[VoiceEngine] Could not start SpeechRecognition instance:', err);
      this.isStarting = false;
      this.isRunning = false;
      this.rec = null;

      if (!this.isDestroyed && this.isAllowed) {
        if (this.restartTimer) clearTimeout(this.restartTimer);
        this.restartTimer = setTimeout(() => {
          this._startRec();
        }, 600);
      }
    }
  }
}
