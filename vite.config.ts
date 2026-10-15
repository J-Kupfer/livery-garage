import { createReadStream, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Dev only: serves the template package from the project root (gitignored) so the
 * app can load it with one click instead of picking the 100 MB zip every time.
 */
function localTemplatePackage(): Plugin {
  return {
    name: 'local-template-package',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/template-package.zip', (_req, res) => {
        const root = server.config.root;
        const file = readdirSync(root).find((f) => /Livery_Templates.*\.zip$/i.test(f));
        if (!file) {
          res.statusCode = 404;
          res.end('No template package in the project root');
          return;
        }
        res.setHeader('Content-Type', 'application/zip');
        createReadStream(join(root, file)).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), localTemplatePackage()],
  worker: { format: 'es' },
  // A single-page canvas editor: Fabric and React alone are ~550 kB minified, loaded once and cached.
  build: { chunkSizeWarningLimit: 1000 },
});
