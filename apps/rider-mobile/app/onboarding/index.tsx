import { useMyRiderApplication } from '@delyva/sdk';
import { Redirect } from 'expo-router';
import type { ReactElement } from 'react';
import { api } from '../../src/api/client';
import { routeForApplication } from '../../src/onboarding/routes';
import { QueryView } from '../../src/ui/query-view';
import { Screen } from '../../src/ui/screen';

/** Resumes the rider application at the first incomplete step (progress is saved server-side). */
export default function OnboardingResume(): ReactElement {
  const app = useMyRiderApplication(api);
  return (
    <Screen testID="screen-onboarding-resume">
      <QueryView query={app}>{(data) => <Redirect href={routeForApplication(data)} />}</QueryView>
    </Screen>
  );
}
