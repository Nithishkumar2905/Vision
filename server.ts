/**
 * ACCESSPREP-X — Main Server Entry Point
 * Delegates to the modular Express architecture in server/src/server.ts
 */

import { app, startServer } from './server/src/server.ts';

export { app, startServer };

startServer();
