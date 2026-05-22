import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMailService,
  MailServiceDeps,
} from '@/plugins/services/mail.service.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_URL = 'http://localhost:3000';

function buildMockDeps() {
  return {
    mailer: { sendMail: vi.fn().mockResolvedValue(undefined) },
    config: { APP_URL },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createMailService', () => {
  let deps: ReturnType<typeof buildMockDeps>;
  let service: ReturnType<typeof createMailService>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildMockDeps();
    service = createMailService(deps as MailServiceDeps);
  });

  describe('sendConfirmationEmail()', () => {
    it('sends to the correct recipient with confirmation and unsub URLs', async () => {
      await service.sendConfirmationEmail(
        'user@test.com',
        'owner/repo',
        'confirm-tok',
        'unsub-tok',
      );

      expect(deps.mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'Confirm your subscription to owner/repo',
          text: expect.stringContaining(`${APP_URL}/api/confirm/confirm-tok`),
          html: expect.stringContaining(`${APP_URL}/api/confirm/confirm-tok`),
        }),
      );
    });

    it('includes the unsubscribe URL in the email body', async () => {
      await service.sendConfirmationEmail(
        'user@test.com',
        'owner/repo',
        'confirm-tok',
        'unsub-tok',
      );

      const { text, html } = deps.mailer.sendMail.mock.calls[0][0];
      expect(text).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
      expect(html).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
    });
  });

  describe('sendReleaseNotification()', () => {
    it('sends to the correct recipient with release and unsub URLs', async () => {
      await service.sendReleaseNotification(
        'user@test.com',
        'owner/repo',
        'v2.0.0',
        'unsub-tok',
      );

      expect(deps.mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@test.com',
          subject: 'New release: owner/repo v2.0.0',
          text: expect.stringContaining(
            'https://github.com/owner/repo/releases/tag/v2.0.0',
          ),
          html: expect.stringContaining(
            'https://github.com/owner/repo/releases/tag/v2.0.0',
          ),
        }),
      );
    });

    it('includes the unsubscribe URL in the email body', async () => {
      await service.sendReleaseNotification(
        'user@test.com',
        'owner/repo',
        'v2.0.0',
        'unsub-tok',
      );

      const { text, html } = deps.mailer.sendMail.mock.calls[0][0];
      expect(text).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
      expect(html).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
    });
  });
});
