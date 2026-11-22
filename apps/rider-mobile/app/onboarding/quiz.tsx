import type { Quiz, QuizResult } from '@delyva/contracts';
import { onboardingKeys, useRiderQuiz } from '@delyva/sdk';
import { RiderBanner, Button, RiderCard, ChoiceGroup, Typography } from '@delyva/ui-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { type ReactElement, useRef, useState } from 'react';
import { api } from '../../src/api/client';
import { t } from '../../src/i18n';
import { newId } from '../../src/lib/ids';
import { stepNumber, TOTAL_STEPS } from '../../src/onboarding/routes';
import { useStepView } from '../../src/onboarding/use-step';
import { QueryView } from '../../src/ui/query-view';
import { Screen } from '../../src/ui/screen';

/** Answers form for the server-scored quiz. */
function QuizForm({ quiz }: { quiz: Quiz }): ReactElement {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const key = useRef(newId());
  const qc = useQueryClient();
  const submit = useMutation({
    mutationFn: () =>
      api.submitRiderQuiz(
        {
          answers: Object.entries(answers).map(([questionId, optionId]) => ({
            questionId,
            optionId,
          })),
        },
        key.current,
      ),
    onSuccess: (r: QuizResult) => {
      key.current = newId();
      if (!r.passed) return;
      void qc.invalidateQueries({ queryKey: onboardingKeys.rider() });
      router.replace('/onboarding/review');
    },
  });
  const complete = quiz.questions.every((q) => answers[q.id] !== undefined);
  const result = submit.data;
  return (
    <>
      <Typography tone="muted">{t('onb.quizBody', { pass: quiz.passMarkPercent })}</Typography>
      {result && !result.passed ? (
        <RiderBanner tone="danger" text={t('onb.quizFailed', { score: result.scorePercent })} />
      ) : null}
      {submit.isError ? <RiderBanner tone="danger" text={t('common.errorBody')} /> : null}
      {quiz.questions.map((q, i) => (
        <RiderCard key={q.id} testID={`quiz-q-${String(i + 1)}`}>
          <Typography variant="h3">{`${String(i + 1)}. ${q.prompt}`}</Typography>
          <ChoiceGroup
            testID={`quiz-${q.id}`}
            label={q.prompt}
            value={answers[q.id] ?? null}
            onChange={(optionId) => {
              setAnswers((a) => ({ ...a, [q.id]: optionId }));
            }}
            options={q.options.map((o) => ({ value: o.id, label: o.label }))}
          />
        </RiderCard>
      ))}
      <Button
        label={t('onb.quizSubmit')}
        variant="brand"
        size="lg"
        disabled={!complete}
        loading={submit.isPending}
        onPress={() => {
          submit.mutate();
        }}
      />
    </>
  );
}

/** Step 6 — training quiz (questions and scoring come from the API). */
export default function QuizStep(): ReactElement {
  useStepView('training_quiz');
  const quiz = useRiderQuiz(api);
  return (
    <Screen
      testID="screen-onb-quiz"
      eyebrow={t('onb.stepOf', { n: stepNumber('training_quiz'), total: TOTAL_STEPS })}
      title={t('onb.quizTitle')}
    >
      <QueryView query={quiz} rows={4}>
        {(data) => <QuizForm quiz={data} />}
      </QueryView>
    </Screen>
  );
}
