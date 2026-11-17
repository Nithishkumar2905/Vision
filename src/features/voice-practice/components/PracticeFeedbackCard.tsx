/**
 * ACCESSPREP-X — Voice Practice Immediate Feedback Card
 */

import React from 'react';

export interface PracticeFeedbackCardProps {
  isCorrect: boolean;
  correctOption: string;
  explanation: string;
}

export function PracticeFeedbackCard({
  isCorrect,
  correctOption,
  explanation
}: PracticeFeedbackCardProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-4 rounded-xl border-2 space-y-2 ${
        isCorrect
          ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
          : 'bg-red-50 border-red-500 text-red-950'
      }`}
    >
      <div className="font-bold text-base">
        {isCorrect ? '✓ Correct Answer!' : `✗ Incorrect — Correct Option: ${correctOption}`}
      </div>
      <p className="text-sm leading-relaxed">{explanation}</p>
    </div>
  );
}
