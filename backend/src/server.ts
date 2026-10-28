import 'dotenv/config';
import { buildApp } from './app.js';

async function start() {
  const app = await buildApp();
  const port = Number(process.env.PORT) || 4000;

  try {
    const address = await app.listen({ port, host: '0.0.0.0' });
    console.log(`NexusEdge Server listening on ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
