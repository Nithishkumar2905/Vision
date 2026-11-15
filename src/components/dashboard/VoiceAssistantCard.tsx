import React, { useState } from 'react';
import { Mic, Square, Sparkles, Volume2 } from 'lucide-react';
import { useAccessibility } from '../../context/AccessibilityContext.tsx';

interface VoiceAssistantCardProps {
  onNavigate: (screen: string) => void;
}

export function VoiceAssistantCard({ onNavigate }: VoiceAssistantCardProps) {
  const {
    isVoiceListening,
    isVisionAssistantActive,
    activateVisionAssistant,
    startVoiceListening,
    stopSpeaking,
    isSpeaking,
    speakText,
    announce
  } = useAccessibility();

  const handleToggleVoice = () => {
    if (isSpeaking) {
      stopSpeaking();
      announce('Reading stopped.', 'polite');
      return;
    }

    if (!isVisionAssistantActive) {
      activateVisionAssistant();
    } else if (isVoiceListening) {
      speakText('Vision Assistant is active and listening. What would you like to do?');
    } else {
      startVoiceListening();
      announce('Microphone listening for commands.', 'polite');
    }
  };

  return (
    <section
      aria-labelledby="voice-assistant-heading"
      className="bg-white border border-[#E8EBF0] rounded-xl p-5 shadow-2xs"
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Text description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1749E8] bg-[#EEF4FF] px-2.5 py-0.5 rounded-full border border-[#D0DEFF]">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              Hands-Free Assistant
            </span>
            {isVoiceListening && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Listening Active
              </span>
            )}
            {isSpeaking && (
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200 flex items-center gap-1">
                <Volume2 className="w-3 h-3 text-blue-600 animate-pulse" />
                Speaking (Say "Stop")
              </span>
            )}
          </div>

          <h2 id="voice-assistant-heading" className="text-base font-bold text-[#172033]">
            What would you like to do today?
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            Say <strong className="text-[#1749E8]">"Hey Vision"</strong>, <strong className="text-[#1749E8]">"Start Practice"</strong>, or <strong className="text-[#1749E8]">"Mock Exam"</strong> anytime.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          {isSpeaking ? (
            <button
              type="button"
              onClick={stopSpeaking}
              aria-label="Stop reading speech"
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <Square className="w-3.5 h-3.5 fill-red-600 text-red-600" aria-hidden="true" />
              Stop Reading (Esc)
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleVoice}
              aria-label={isVisionAssistantActive ? 'Vision Assistant Active — Click to test speech' : 'Activate Vision Voice Assistant (Alt+Space)'}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isVisionAssistantActive
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500'
                  : 'bg-[#1749E8] text-white hover:bg-[#123BB8] focus:ring-[#1749E8]'
              }`}
            >
              <Mic className="w-3.5 h-3.5" aria-hidden="true" />
              {isVisionAssistantActive ? 'Vision Active (Listening)' : 'Activate Assistant (Alt+Space)'}
            </button>
          )}
        </div>
      </div>

      {/* Voice command hints list */}
      <div className="mt-4 pt-4 border-t border-[#E8EBF0]">
        <p className="text-[11px] font-semibold text-[#64748B] uppercase tracking-wide mb-2">
          Recognized Voice Commands
        </p>
        <ul className="flex flex-wrap gap-2" aria-label="Available voice commands">
          {[
            'Hey Vision',
            'Start Practice',
            'Mock Exam',
            'AI Tutor',
            'Tuition Planner',
            'My Progress',
            'Read Dashboard',
            'Stop'
          ].map((cmd) => (
            <li key={cmd}>
              <span className="inline-block px-2.5 py-1 text-xs font-semibold text-[#172033] bg-[#F8F9FB] border border-[#E8EBF0] rounded-md">
                &ldquo;{cmd}&rdquo;
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
