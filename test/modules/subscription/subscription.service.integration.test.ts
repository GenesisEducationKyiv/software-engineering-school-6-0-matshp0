import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import nodemailer from 'nodemailer';
import { Kysely } from 'kysely';
import {
  createSubscriptionService,
  SubscriptionServiceDeps,
} from '../../../src/modules/subscription/subscription.service.js';
import { SubscriptionRepository } from '../../../src/plugins/repositories/subscription.repository.js';
import { createMailService } from '../../../src/plugins/services/mail.service.js';
import { createMailer } from '../../../src/plugins/infrastructure/mail/transporter.js';
import {
  ConflictError,
  NotFoundError,
} from '../../../src/common/errors/index.js';
import { DB } from '../../../src/plugins/infrastructure/database/types.js';
import { buildKysely, truncateTables } from '../../setup/db.js';
import { clearMessages, getMessages } from '../../setup/mailpit.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_EMAIL = 'subscriber@test.com';
const TEST_REPO = 'owner/test-repo';
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

function createTestService(db: Kysely<DB>) {
  const subscriptionRepository = new SubscriptionRepository(db);

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT),
    secure: false,
  });
  const mailer = createMailer(transporter, {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as never);

  const mailService = createMailService({
    mailer,
    config: { APP_URL: process.env.APP_URL ?? 'http://localhost:3000' },
  });

  const githubService: SubscriptionServiceDeps['githubService'] = {
    ensureRepoExists: vi.fn(),
  };

  const service = createSubscriptionService({
    githubService,
    subscriptionRepository,
    notifier: mailService,
    log: { info: vi.fn() },
  });

  return { service, mailer, githubService };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('SubscriptionService (integration)', () => {
  let db: Kysely<DB>;
  let mailer: ReturnType<typeof createMailer>;
  let service: ReturnType<typeof createSubscriptionService>;
  let githubService: SubscriptionServiceDeps['githubService'];
  let repoId: string;

  beforeAll(() => {
    db = buildKysely();
    ({ service, mailer, githubService } = createTestService(db));
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearMessages();
    await truncateTables(db);

    const [repo] = await db
      .insertInto('repositories')
      .values({ fullName: TEST_REPO, lastSeenTag: null, etag: null })
      .returningAll()
      .execute();
    repoId = repo.id;

    (
      githubService.ensureRepoExists as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      id: repoId,
      fullName: TEST_REPO,
    });
  });

  // ─── subscribe() ───────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('creates a pending subscription in the DB', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);

      const rows = await db.selectFrom('subscriptions').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        email: TEST_EMAIL,
        repositoryId: repoId,
        status: 'pending',
      });
    });

    it('sends a confirmation email to Mailpit', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);
      await mailer.drain();

      const messages = await getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].To[0].Address).toBe(TEST_EMAIL);
      expect(messages[0].Subject).toContain(TEST_REPO);
    });

    it('throws ConflictError when the same email subscribes to the same repo twice', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);

      await expect(
        service.subscribe(TEST_EMAIL, TEST_REPO),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  // ─── confirmSubscription() ─────────────────────────────────────────────────

  describe('confirmSubscription()', () => {
    it('sets the subscription status to confirmed', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await db
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();

      await service.confirmSubscription(sub.confirmToken);

      const updated = await db
        .selectFrom('subscriptions')
        .selectAll()
        .where('id', '=', sub.id)
        .executeTakeFirstOrThrow();
      expect(updated.status).toBe('confirmed');
    });

    it('throws NotFoundError for an unknown token', async () => {
      await expect(
        service.confirmSubscription(FAKE_UUID),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // ─── unsubscribe() ─────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('removes the subscription from the DB', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await db
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();

      await service.unsubscribe(sub.unsubToken);

      const remaining = await db
        .selectFrom('subscriptions')
        .selectAll()
        .execute();
      expect(remaining).toHaveLength(0);
    });

    it('throws NotFoundError for an unknown token', async () => {
      await expect(service.unsubscribe(FAKE_UUID)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  // ─── getSubscriptionsByEmail() ─────────────────────────────────────────────

  describe('getSubscriptionsByEmail()', () => {
    it('returns confirmed subscriptions with email and repository', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await db
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();
      await service.confirmSubscription(sub.confirmToken);

      const result = await service.getSubscriptionsByEmail(TEST_EMAIL);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        email: TEST_EMAIL,
        repository: TEST_REPO,
      });
    });

    it('excludes pending subscriptions', async () => {
      await service.subscribe(TEST_EMAIL, TEST_REPO);

      const result = await service.getSubscriptionsByEmail(TEST_EMAIL);

      expect(result).toHaveLength(0);
    });
  });
});
