import { createApp } from '../app/createApp.tsx';
import { createNodeRuntime } from '../runtime/node.ts';
import { startNodeHttpServer } from './nodeHttpServer.ts';

const runtime = createNodeRuntime(process.env);
const app = createApp(runtime);
const port = Number(process.env.PORT || 8787);

startNodeHttpServer(app, { port, logger: runtime.logger });
