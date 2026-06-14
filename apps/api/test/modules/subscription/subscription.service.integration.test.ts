import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import serviceApp from '@/app.ts';
import { RoutingKey } from '@github-notifier/contracts/mailer';
import { truncateTables } from '@test/setup/db.ts';
import { getPublishedMessages, resetQueue } from '@test/setup/rabbitmq.ts';

const TEST_EMAIL = 'subscriber@test.com';
const TEST_REPO = 'owner/test-repo';
const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });
  fastify.register(fp(serviceApp));
  await fastify.ready();
  return fastify;
}

function mockOctokitRepos(
  fastify: FastifyInstance,
  overrides: {
    get?: ReturnType<typeof vi.fn>;
    getLatestRelease?: ReturnType<typeof vi.fn>;
  } = {},
) {
  Object.assign(fastify.octokit.repos, {
    get: vi.fn().mockResolvedValue({}),
    getLatestRelease: vi.fn().mockResolvedValue({
      data: { tag_name: 'v1.0.0' },
      headers: { etag: '"etag-abc"' },
    }),
    ...overrides,
  });
}

describe('SubscriptionService (integration)', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    fastify = await buildApp();
  });

  afterAll(async () => {
    await fastify.close();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockOctokitRepos(fastify);
    await resetQueue();
    await truncateTables(fastify.kysely);
  });

  // ─── subscribe() ───────────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('creates a pending subscription in the DB', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);

      const rows = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ email: TEST_EMAIL, status: 'pending' });
    });

    it('publishes a confirmation email event', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);

      const messages = await getPublishedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].routingKey).toBe(RoutingKey.ConfirmationEmail);
      expect(messages[0].payload).toMatchObject({
        email: TEST_EMAIL,
        repoFullName: TEST_REPO,
      });
    });

    it('throws ConflictError when the same email subscribes to the same repo twice', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);

      await expect(
        fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO),
      ).rejects.toMatchObject({ name: 'ConflictError' });
    });

    it('throws NotFoundError when the GitHub repo does not exist', async () => {
      mockOctokitRepos(fastify, {
        get: vi.fn().mockRejectedValue({ status: 404 }),
      });

      await expect(
        fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  describe('confirmSubscription()', () => {
    it('sets the subscription status to confirmed', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();

      await fastify.subscriptionService.confirmSubscription(sub.confirmToken);

      const updated = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .where('id', '=', sub.id)
        .executeTakeFirstOrThrow();
      expect(updated.status).toBe('confirmed');
    });

    it('throws NotFoundError for an unknown token', async () => {
      await expect(
        fastify.subscriptionService.confirmSubscription(FAKE_UUID),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  // ─── unsubscribe() ─────────────────────────────────────────────────────────

  describe('unsubscribe()', () => {
    it('removes the subscription from the DB', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();

      await fastify.subscriptionService.unsubscribe(sub.unsubToken);

      const remaining = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .execute();
      expect(remaining).toHaveLength(0);
    });

    it('throws NotFoundError for an unknown token', async () => {
      await expect(
        fastify.subscriptionService.unsubscribe(FAKE_UUID),
      ).rejects.toMatchObject({ name: 'NotFoundError' });
    });
  });

  describe('getSubscriptionsByEmail()', () => {
    it('returns confirmed subscriptions with email and repository', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);
      const sub = await fastify.kysely
        .selectFrom('subscriptions')
        .selectAll()
        .executeTakeFirstOrThrow();
      await fastify.subscriptionService.confirmSubscription(sub.confirmToken);

      const result =
        await fastify.subscriptionService.getSubscriptionsByEmail(TEST_EMAIL);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        email: TEST_EMAIL,
        repository: TEST_REPO,
      });
    });

    it('excludes pending subscriptions', async () => {
      await fastify.subscriptionService.subscribe(TEST_EMAIL, TEST_REPO);

      const result =
        await fastify.subscriptionService.getSubscriptionsByEmail(TEST_EMAIL);

      expect(result).toHaveLength(0);
    });
  });
});
