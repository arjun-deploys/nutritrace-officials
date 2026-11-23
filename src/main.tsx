import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@/styles/globals.css';
import '@/i18n';
import { Providers } from '@/app/providers';
import { createAppRouter } from '@/app/router';
import { registerSender } from '@/stores/offline-queue';
import { inventory, meals } from '@/lib/api';
import type { GrnCreateInput, ProductionCreateInput } from '@nt/domain';
import { DemoBar } from '@/demo/demo-bar';
import { PersonaPicker } from '@/demo/personas-panel';

registerSender('receipt', (s) => inventory.receive(s.payload as GrnCreateInput, s.id));
registerSender('production', (s) => meals.produce(s.payload as ProductionCreateInput, s.id));

const root = createRoot(document.getElementById('root')!);
const splash = document.getElementById('demo-splash');

async function boot() {
  const { worker } = await import('@/mocks/browser');
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true, serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` } });
  // Simulate the state programme (≈1 s) before the first screen asks for data.
  const { getStore } = await import('@/mocks/seed/simulate');
  getStore('TN');
  const { replay } = await import('@/mocks/journal');
  await replay();
  const router = createAppRouter({ banner: <DemoBar />, loginAside: <PersonaPicker /> });
  splash?.remove();
  root.render(
    <StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  );
}
void boot();
