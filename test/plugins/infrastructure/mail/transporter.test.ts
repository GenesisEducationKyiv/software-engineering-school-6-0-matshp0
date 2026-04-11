import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMailer } from '../../../../src/plugins/infrastructure/mail/transporter.js';
import type nodemailer from 'nodemailer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildJob(overrides = {}) {
  return {
    to: 'user@test.com',
    from: 'noreply@test.com',
    subject: 'Test',
    text: 'Hello',
    html: '<p>Hello</p>',
    ...overrides,
  };
}

function buildMockTransporter() {
  return { sendMail: vi.fn() } as unknown as nodemailer.Transporter;
}

function buildLog() {
  return { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
}

/** Returns a promise plus its external resolve/reject handles. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createMailer', () => {
  let transporter: ReturnType<typeof buildMockTransporter>;
  let log: ReturnType<typeof buildLog>;

  beforeEach(() => {
    vi.clearAllMocks();
    transporter = buildMockTransporter();
    log = buildLog();
  });

  describe('sendMail()', () => {
    it('passes the job to the transporter', async () => {
      (transporter.sendMail as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined,
      );
      const mailer = createMailer(transporter, log as any);
      const job = buildJob();

      await mailer.sendMail(job);

      expect(transporter.sendMail).toHaveBeenCalledWith(job);
    });

    it('rejects when the transporter fails', async () => {
      const error = new Error('SMTP error');
      (transporter.sendMail as ReturnType<typeof vi.fn>).mockRejectedValue(
        error,
      );
      const mailer = createMailer(transporter, log as any);

      await expect(mailer.sendMail(buildJob())).rejects.toThrow('SMTP error');
      expect(log.error).toHaveBeenCalledOnce();
    });
  });

  describe('concurrency', () => {
    it('processes up to 5 jobs simultaneously', async () => {
      const deferreds = Array.from({ length: 6 }, () => deferred());
      let activeCount = 0;
      let maxActive = 0;

      (transporter.sendMail as ReturnType<typeof vi.fn>).mockImplementation(
        () => {
          activeCount++;
          maxActive = Math.max(maxActive, activeCount);
          const d = deferreds[activeCount - 1];
          return d.promise.finally(() => activeCount--);
        },
      );

      const mailer = createMailer(transporter, log as any);
      const sends = Array.from({ length: 6 }, (_, i) =>
        mailer.sendMail(buildJob({ to: `user${i}@test.com` })),
      );

      await new Promise((r) => setTimeout(r, 0));

      expect(transporter.sendMail).toHaveBeenCalledTimes(5);
      expect(maxActive).toBe(5);

      deferreds[0].resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(transporter.sendMail).toHaveBeenCalledTimes(6);

      deferreds.slice(1).forEach((d) => d.resolve());
      await Promise.all(sends);
    });
  });

  describe('drain()', () => {
    it('resolves immediately when there is nothing in flight', async () => {
      const mailer = createMailer(transporter, log as any);
      await expect(mailer.drain()).resolves.toBeUndefined();
    });

    it('resolves only after all in-flight jobs finish', async () => {
      const d1 = deferred();
      const d2 = deferred();
      (transporter.sendMail as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(d1.promise)
        .mockReturnValueOnce(d2.promise);

      const mailer = createMailer(transporter, log as any);
      mailer.sendMail(buildJob({ to: 'a@test.com' }));
      mailer.sendMail(buildJob({ to: 'b@test.com' }));

      let drained = false;
      const drainPromise = mailer.drain().then(() => {
        drained = true;
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(drained).toBe(false);

      d1.resolve();
      await new Promise((r) => setTimeout(r, 0));
      expect(drained).toBe(false);

      d2.resolve();
      await drainPromise;
      expect(drained).toBe(true);
    });
  });
});
