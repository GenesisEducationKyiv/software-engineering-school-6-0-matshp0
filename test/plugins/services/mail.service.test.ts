import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMailService } from '@/plugins/services/mail.service.ts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_URL = 'http://localhost:3000';

function buildMockDeps() {
  return {
    mailer: { sendMail: vi.fn().mockResolvedValue(undefined) },
    config: { APP_URL },
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createMailService', () => {
  let deps: ReturnType<typeof buildMockDeps>;
  let service: ReturnType<typeof createMailService>;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = buildMockDeps();
    service = createMailService(deps);
  });

  describe('sendConfirmationEmail()', () => {
    it('sends to the correct recipient with confirmation and unsub URLs', async () => {
      await service.sendConfirmationEmail({
        email: 'user@test.com',
        repoFullName: 'owner/repo',
        confirmToken: 'confirm-tok',
        unsubToken: 'unsub-tok',
      });

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
      await service.sendConfirmationEmail({
        email: 'user@test.com',
        repoFullName: 'owner/repo',
        confirmToken: 'confirm-tok',
        unsubToken: 'unsub-tok',
      });

      const { text, html } = deps.mailer.sendMail.mock.calls[0][0];
      expect(text).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
      expect(html).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
    });
  });

  describe('sendReleaseNotification()', () => {
    it('sends to the correct recipient with release and unsub URLs', async () => {
      await service.sendReleaseNotification({
        email: 'user@test.com',
        repoFullName: 'owner/repo',
        tagName: 'v2.0.0',
        unsubToken: 'unsub-tok',
      });

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
      await service.sendReleaseNotification({
        email: 'user@test.com',
        repoFullName: 'owner/repo',
        tagName: 'v2.0.0',
        unsubToken: 'unsub-tok',
      });

      const { text, html } = deps.mailer.sendMail.mock.calls[0][0];
      expect(text).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
      expect(html).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
    });
  });
});
