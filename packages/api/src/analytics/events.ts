/**
 * Canonical names for the server-emitted product-analytics events — the
 * ground-truth funnel actions captured from tRPC mutations (browser-side UI
 * events live in the web package). Referencing these constants instead of raw
 * strings keeps a typo from silently splitting an event in PostHog.
 *
 * Convention: `object.action`, past tense.
 */
export const ANALYTICS_EVENTS = {
  CLIENT_CREATED: "client.created",
  PROJECT_CREATED: "project.created",
  PROJECT_STATUS_CHANGED: "project.status_changed",
  ESTIMATE_CREATED: "estimate.created",
  ESTIMATE_STATUS_CHANGED: "estimate.status_changed",
} as const;
