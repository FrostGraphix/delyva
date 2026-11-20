import { OnboardingError } from './onboarding-errors.js';

/** Pass mark for the rider training quiz, in percent. */
export const QUIZ_PASS_MARK_PERCENT = 80;

interface QuizQuestionDef {
  readonly id: string;
  readonly prompt: string;
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly answer: string;
}

/**
 * Rider training quiz (server-side answer key; never sent to clients).
 * DEBT(onboarding): English-only, hard-coded content — no CMS yet — move to i18n keys + ops-editable store.
 */
export const RIDER_QUIZ: readonly QuizQuestionDef[] = [
  {
    id: 'q1',
    prompt: 'When must you ask the customer for the delivery code?',
    options: [
      { id: 'a', label: 'Before handing over the order' },
      { id: 'b', label: 'After the customer has eaten' },
      { id: 'c', label: 'Never' },
    ],
    answer: 'a',
  },
  {
    id: 'q2',
    prompt: 'The vendor says the food is not ready. What do you do?',
    options: [
      { id: 'a', label: 'Cancel the trip' },
      { id: 'b', label: 'Wait and update the app if the delay is long' },
      { id: 'c', label: 'Take another customer’s order' },
    ],
    answer: 'b',
  },
  {
    id: 'q3',
    prompt: 'How do you call a customer?',
    options: [
      { id: 'a', label: 'Copy their number into your phone' },
      { id: 'b', label: 'Use the call button in the app (masked number)' },
    ],
    answer: 'b',
  },
  {
    id: 'q4',
    prompt: 'What must you wear on a motorcycle at all times?',
    options: [
      { id: 'a', label: 'A helmet' },
      { id: 'b', label: 'Sunglasses' },
    ],
    answer: 'a',
  },
  {
    id: 'q5',
    prompt: 'The customer is unreachable at the drop-off. What next?',
    options: [
      { id: 'a', label: 'Leave the food at the gate' },
      { id: 'b', label: 'Follow the in-app unreachable flow and contact support' },
      { id: 'c', label: 'Keep the order' },
    ],
    answer: 'b',
  },
];

/** Public view of the quiz (no answer key). */
export function publicQuiz(): {
  passMarkPercent: number;
  questions: { id: string; prompt: string; options: { id: string; label: string }[] }[];
} {
  return {
    passMarkPercent: QUIZ_PASS_MARK_PERCENT,
    questions: RIDER_QUIZ.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options.map((o) => ({ ...o })),
    })),
  };
}

/** Scores answers on the server. Unanswered questions count as wrong. @throws on unknown/duplicate ids */
export function scoreQuiz(answers: readonly { questionId: string; optionId: string }[]): {
  correct: number;
  total: number;
  scorePercent: number;
  passed: boolean;
} {
  const seen = new Set<string>();
  let correct = 0;
  for (const a of answers) {
    const q = RIDER_QUIZ.find((x) => x.id === a.questionId);
    if (!q) throw new OnboardingError('validation_failed', `Unknown question ${a.questionId}.`);
    if (seen.has(a.questionId)) {
      throw new OnboardingError('validation_failed', `Question ${a.questionId} answered twice.`);
    }
    seen.add(a.questionId);
    if (q.answer === a.optionId) correct += 1;
  }
  const total = RIDER_QUIZ.length;
  const scorePercent = Math.floor((correct * 100) / total);
  return { correct, total, scorePercent, passed: scorePercent >= QUIZ_PASS_MARK_PERCENT };
}
