import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

export async function startHttp(app) {
  const started = performance.now();
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  console.log('HTTP startup ms:', Math.round(performance.now() - started));
  return server;
}

export async function stopHttp(server) {
  const started = performance.now();
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  console.log('HTTP teardown ms:', Math.round(performance.now() - started));
}
