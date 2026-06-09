/**
 * Shared messaging contract between the API (publisher) and the email
 * service (consumer). Both sides import the same exchange/routing-key
 * constants and event payload types so the wire format stays in sync.
 */

/** Durable topic exchange that all notification events are published to. */
export const NOTIFICATIONS_EXCHANGE = 'notifications';

/** Durable queue the email service consumes from. */
export const EMAIL_QUEUE = 'email.notifications';

/** Routing keys used to publish to {@link NOTIFICATIONS_EXCHANGE}. */
export const RoutingKey = {
  ConfirmationEmail: 'email.confirmation',
  ReleaseEmail: 'email.release',
} as const;

export type RoutingKey = (typeof RoutingKey)[keyof typeof RoutingKey];

/** Sent when a new subscription is created and needs e-mail confirmation. */
export interface ConfirmationEmailEvent {
  email: string;
  repoFullName: string;
  confirmToken: string;
  unsubToken: string;
}

/** Sent when a watched repository publishes a new release. */
export interface ReleaseEmailEvent {
  email: string;
  repoFullName: string;
  tagName: string;
  unsubToken: string;
}
