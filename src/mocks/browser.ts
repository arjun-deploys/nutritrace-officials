import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { dispatch } from './index';
import { record } from './journal';

/** One catch-all handler: MSW intercepts /api/v1/* and the in-browser server answers. */
export const worker = setupWorker(
  http.all('/api/v1/*', async ({ request }) => {
    const url = new URL(request.url);
    let body: unknown;
    if (request.method !== 'GET' && request.headers.get('content-type')?.includes('json')) body = await request.json().catch(() => undefined);
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 180)); // feel of a real network
    const [status, res] = await dispatch(request.method, url.pathname, {
      query: Object.fromEntries(url.searchParams), body, auth: request.headers.get('authorization'), idempotencyKey: request.headers.get('idempotency-key') ?? undefined,
    });
    if (request.method !== 'GET' && status < 300) record({ method: request.method, path: url.pathname, query: Object.fromEntries(url.searchParams), body, auth: request.headers.get('authorization'), idem: request.headers.get('idempotency-key') ?? undefined });
    if (res instanceof Response) return res;
    return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(res as object, { status });
  }),
);
