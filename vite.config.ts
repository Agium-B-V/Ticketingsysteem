import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// De base path komt uit VITE_BASE_PATH, zodat dezelfde build werkt op
// GitHub Pages (bv. /Ticketingsysteem/) en later op Azure Static Web Apps (/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const raw = env.VITE_BASE_PATH || '/';
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  return {
    base,
    plugins: [react()],
    build: { sourcemap: false },
  };
});
