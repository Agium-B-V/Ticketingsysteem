import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Zet in de productiebuild een Content-Security-Policy in index.html. GitHub
 * Pages kan geen eigen headers sturen; op Azure kan dit later als header in
 * staticwebapp.config.json (zie README).
 */
function contentSecurityPolicy(supabaseUrl: string): Plugin {
  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    origin = '';
  }
  const ws = origin.replace(/^http/, 'ws');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${origin} ${ws}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'agium-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

// De base path komt uit VITE_BASE_PATH, zodat dezelfde build werkt op
// GitHub Pages (bv. /Ticketingsysteem/) en later op Azure Static Web Apps (/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const raw = env.VITE_BASE_PATH || '/';
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  return {
    base,
    plugins: [react(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    build: { sourcemap: false },
  };
});
