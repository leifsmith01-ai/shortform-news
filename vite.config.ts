import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs'

// Vite middleware plugin: serves api/*.js handlers locally (mirrors Vercel serverless in dev)
function localApiPlugin() {
  // Per-handler module cache so in-memory caches (e.g. news CACHE) persist between requests
  const moduleCache: Record<string, { module: any; mtime: number }> = {};

  return {
    name: 'local-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) return next();

        // Derive handler file from URL: /api/news → api/news.js, /api/admin-set-premium → api/admin-set-premium.js
        const urlPath = req.url.split('?')[0]; // strip query string
        const handlerName = urlPath.replace(/^\/api\//, '').replace(/\/$/, '') || 'news';
        const handlerPath = path.resolve(__dirname, `api/${handlerName}.js`);

        if (!fs.existsSync(handlerPath)) return next();

        let chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', async () => {
          try {
            const bodyStr = Buffer.concat(chunks).toString();
            req.body = bodyStr ? JSON.parse(bodyStr) : {};
          } catch {
            req.body = {};
          }

          // Simple res shim matching Vercel's response API
          const resShim = {
            statusCode: 200,
            headers: {} as Record<string, string>,
            setHeader(key: string, val: string) { this.headers[key] = val; res.setHeader(key, val); },
            status(code: number) { this.statusCode = code; res.statusCode = code; return this; },
            json(data: any) {
              res.statusCode = this.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            },
            end() { res.end(); }
          };

          try {
            const mtime = fs.statSync(handlerPath).mtimeMs;
            const cached = moduleCache[handlerName];
            if (!cached || mtime !== cached.mtime) {
              const fileUrl = pathToFileURL(handlerPath).href + `?t=${mtime}`;
              moduleCache[handlerName] = { module: await import(fileUrl), mtime };
              console.log(`[local-api] Loaded api/${handlerName}.js (fresh)`);
            }
            const handler = moduleCache[handlerName].module.default ?? moduleCache[handlerName].module;
            await handler(req, resShim);
          } catch (err: any) {
            console.error(`[local-api] Handler error (${handlerName}):`, err.message);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ ones) so the API handler can read NEWS_API_KEY
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), localApiPlugin()],
    server: {
      port: 3000,
      strictPort: true,
      host: true
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
