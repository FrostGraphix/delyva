/** Funnel events (CLAUDE.md onboarding). Properties must never contain PII. */
export type AnalyticsEvent =
  | { name: 'onboarding_step_viewed'; step: string }
  | { name: 'onboarding_step_completed'; step: string }
  | { name: 'order_placed'; method: string };

type Sink = (e: AnalyticsEvent) => void;

let sink: Sink = () => undefined;

/**
 * Records a product event.
 * DEBT(analytics): no-op sink — PostHog SDK not added yet (needs key + consent screen) — wire posthog-react-native behind the consent record.
 */
export function track(event: AnalyticsEvent): void {
  sink(event);
}

/** Replaces the sink (tests, or the PostHog adapter later). */
export function setAnalyticsSink(next: Sink): void {
  sink = next;
}
