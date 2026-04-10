import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export default fp(
  async function (fastify: FastifyInstance) {
    const intervalMs = fastify.config.SCAN_INTERVAL * 60 * 1000;
    let isScanning = false;

    const tick = async () => {
      if (isScanning) return;
      isScanning = true;
      try {
        await fastify.scannerService.scan();
      } catch (err) {
        fastify.log.error(err, 'Scanner: fatal error');
      } finally {
        isScanning = false;
      }
    };

    fastify.addHook('onReady', async () => {
      tick();
      setInterval(tick, intervalMs);

      fastify.log.info(
        { intervalMinutes: fastify.config.SCAN_INTERVAL },
        'Scanner: started',
      );
    });
  },
  {
    name: 'scannerPlugin',
  },
);
