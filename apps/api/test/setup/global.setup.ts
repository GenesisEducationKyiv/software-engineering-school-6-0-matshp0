import { execSync } from 'child_process';
import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

const PG_USER = 'testuser';
const PG_PASSWORD = 'testpassword';
const PG_DB = 'github_notifier_test';

export async function setup(project: TestProject) {
  const [pg, mailpit] = await Promise.all([
    new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: PG_USER,
        POSTGRES_PASSWORD: PG_PASSWORD,
        POSTGRES_DB: PG_DB,
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage('database system is ready to accept connections'),
      )
      .start(),
    new GenericContainer('axllent/mailpit:latest')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start(),
  ]);

  const dbUrl = `postgresql://${PG_USER}:${PG_PASSWORD}@${pg.getHost()}:${pg.getMappedPort(5432)}/${PG_DB}`;
  process.env.DATABASE_URL = dbUrl;

  execSync('node_modules/.bin/prisma migrate deploy', { stdio: 'inherit' });

  project.provide('POSTGRES_HOST', pg.getHost());
  project.provide('POSTGRES_PORT', String(pg.getMappedPort(5432)));
  project.provide('POSTGRES_USER', PG_USER);
  project.provide('POSTGRES_PASSWORD', PG_PASSWORD);
  project.provide('POSTGRES_DATABASE', PG_DB);
  project.provide('MAIL_HOST', mailpit.getHost());
  project.provide('MAIL_PORT', String(mailpit.getMappedPort(1025)));
  project.provide(
    'MAILPIT_API_URL',
    `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`,
  );

  return async () => {
    await Promise.all([pg.stop(), mailpit.stop()]);
  };
}
