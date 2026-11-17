# Production Deployment Guide

## Build & Start Commands

1. **Compile TypeScript & Build Production Client Bundle**:
   ```bash
   npm run lint
   npm run build
   ```
   This outputs the optimized frontend assets to `dist/`.
2. **Start Production Server**:
   ```bash
   NODE_ENV=production PORT=3000 npx tsx server.ts
   ```
   In production mode (`NODE_ENV=production`), `server/src/server.ts` serves static assets from `dist/` and mounts all `/api/*` endpoints on the configured `PORT`.
