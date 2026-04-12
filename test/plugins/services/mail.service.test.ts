import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMailService } from '../../../src/plugins/services/mail.service.js';
import type { FastifyInstance } from 'fastify';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const APP_URL = 'http://localhost:3000';

function buildMockFastify() {
  return {
    mailer: { sendMail: vi.fn().mockResolvedValue(undefined) },
    config: { APP_URL },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createMailService', () => {
  let fastify: ReturnType<typeof buildMockFastify>;
  let service: ReturnType<typeof createMailService>;

  beforeEach(() => {
    vi.clearAllMocks();
    fastify = buildMockFastify();
    service = createMailService(fastify as unknown as FastifyInstance);
  });

  describe('sendConfirmationEmail()', () => {
    it('sends to the correct recipient with confirmation and unsub URLs', async () => {
      await service.sendConfirmationEmail(
        'user@test.com',
        'owner/repo',
        'confirm-tok',
        'unsub-tok',
      );

      expect(fastify.mailer.sendMail).toHaveBeenCalledWith(
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

      const { text, html } = fastify.mailer.sendMail.mock.calls[0][0];
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

      expect(fastify.mailer.sendMail).toHaveBeenCalledWith(
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

      const { text, html } = fastify.mailer.sendMail.mock.calls[0][0];
      expect(text).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
      expect(html).toContain(`${APP_URL}/api/unsubscribe/unsub-tok`);
    });
  });
});
