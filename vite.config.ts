import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs'

// Vite middleware plugin: serves api/news.js locally (mirrors Vercel serverless in dev)
function localApiPlugin() {
  const handlerPath = path.resolve(__dirname, 'api/news.js');
  // Cache the imported module so the in-memory CACHE inside api/news.js persists between requests
  let cachedModule: any = null;
  let cachedMtime = 0;

  return {
    name: 'local-api',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) return next();

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
            // Only re-import api/news.js if it has changed on disk (preserves in-memory cache between requests)
            const mtime = fs.statSync(handlerPath).mtimeMs;
            if (!cachedModule || mtime !== cachedMtime) {
              const fileUrl = pathToFileURL(handlerPath).href + `?t=${mtime}`;
              cachedModule = await import(fileUrl);
              cachedMtime = mtime;
              console.log('[local-api] Loaded api/news.js (fresh)');
            }
            const handler = cachedModule.default ?? cachedModule;
            await handler(req, resShim);
          } catch (err: any) {
            console.error('[local-api] Handler error:', err.message);
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
