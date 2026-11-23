import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@nt/domain': fileURLToPath(new URL('./src/domain/index.ts', import.meta.url)), '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5174 },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('leaflet')) return 'maps';
          if (/[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'react';
          if (id.includes('radix-ui') || id.includes('@radix-ui') || id.includes('@floating-ui')) return 'ui';
          if (id.includes('devtools')) return 'devtools';
          return undefined;
        },
      },
    },
  },
});
