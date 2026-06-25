import posthog from "posthog-js";

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";

/** True when a project key is present; capture is skipped entirely otherwise. */
export const analyticsEnabled = Boolean(KEY);

/**
 * Initialise PostHog once, before React renders. The project key is public
 * (write-only ingestion), so it's safe in the browser bundle. Pageviews are
 * captured manually on navigation (see AnalyticsBridge) and all input fields
 * are masked in session replay because our forms hold customer PII.
 */
export function initAnalytics(): void {
  if (!KEY) {
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    capture_pageview: false,
    session_recording: { maskAllInputs: true },
  });
}

export { posthog };

/**
 * Browser-side UI events. The server owns the funnel events (project.created,
 * …); these are interactions only the browser can see. Past-tense object.action.
 */
export const WEB_EVENTS = {
  SIGNUP_CTA_CLICKED: "signup_cta.clicked",
  SIGNIN_CTA_CLICKED: "signin_cta.clicked",
  NEW_ESTIMATE_CLICKED: "new_estimate.clicked",
} as const;

/** Thin guard so callers don't repeat the enabled check. */
export function track(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!analyticsEnabled) {
    return;
  }
  posthog.capture(event, properties);
}
