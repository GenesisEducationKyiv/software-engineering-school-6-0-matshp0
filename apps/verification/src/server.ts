import Fastify from 'fastify';
import fp from 'fastify-plugin';
import type { Server as GrpcServer } from '@grpc/grpc-js';
import serviceApp from './app.js';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { buildLoggerConfig } from './common/logger.js';
import { startGrpcServer } from './grpc/server.js';

const app = Fastify({
  logger: buildLoggerConfig(),
  ajv: {
    customOptions: {
      removeAdditional: 'all',
    },
  },
}).withTypeProvider<TypeBoxTypeProvider>();

let grpcServer: GrpcServer | undefined;

async function init() {
  app.register(fp(serviceApp));

  await app.ready();

  try {
    const port = Number(process.env.PORT ?? 3002);
    await app.listen({ port, host: '0.0.0.0' });

    const grpcPort = Number(process.env.GRPC_PORT ?? 50051);
    grpcServer = await startGrpcServer({
      verificationService: app.verificationService,
      log: app.log,
      port: grpcPort,
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'Shutting down verification service');

  const gs = grpcServer;
  if (gs) {
    await new Promise<void>((resolve) => gs.tryShutdown(() => resolve()));
  }
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void init();
