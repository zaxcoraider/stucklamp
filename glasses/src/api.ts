// Talks to the Stucklamp server. If no server is reachable, falls back to a
// local demo class so the browser preview and simulator always work.
import type { Cluster, QueueState, Ticket } from './types';

const BASE = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://localhost:8787';
const ROOM = (import.meta.env.VITE_ROOM as string | undefined) ?? 'demo';

export interface Api {
  mode: 'server' | 'demo';
  get(): Promise<QueueState>;
  claim(id: string): Promise<void>;   // "on my way" -> DM to student
  done(id: string, note?: string): Promise<void>;
  postFix(clusterId: string): Promise<void>; // one message to the whole class
}

async function call(path: string, body?: unknown): Promise<any> {
  const r = await fetch(`${BASE}/api/rooms/${ROOM}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export async function connect(): Promise<Api> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    await fetch(`${BASE}/health`, { signal: ctl.signal });
    clearTimeout(t);
    return {
      mode: 'server',
      get: () => call(''),
      claim: (id) => call(`/tickets/${id}/claim`, {}),
      done: (id, note) => call(`/tickets/${id}/done`, { note }),
      postFix: (cid) => call(`/clusters/${cid}/post`, {}),
    };
  } catch {
    return demoApi();
  }
}

function demoApi(): Api {
  const now = Date.now();
  const m = 60000;
  const tickets: Ticket[] = [
    { id: 't1', seat: '14', name: 'Maya', problem: 'pip install fails: no module "flask"', createdAt: now - 9 * m, status: 'waiting' },
    { id: 't2', seat: '3', name: 'Omar', problem: 'pip install: externally-managed error', createdAt: now - 7 * m, status: 'waiting' },
    { id: 't3', seat: '22', name: 'Lena', problem: 'CSS grid not centering', createdAt: now - 5 * m, status: 'waiting' },
    { id: 't4', seat: '9', name: 'Ravi', problem: 'pip says permission denied', createdAt: now - 4 * m, status: 'waiting' },
    { id: 't5', seat: '17', name: 'Sara', problem: 'git push rejected', createdAt: now - 2 * m, status: 'waiting' },
  ];
  let clusters: Cluster[] = [
    { id: 'c1', label: '3 can\'t pip install', ticketIds: ['t1', 't2', 't4'],
      fix: 'Run: python -m venv .venv && source .venv/bin/activate, then pip install again' },
  ];
  let helpedToday = 0;
  const find = (id: string) => tickets.find((t) => t.id === id)!;
  return {
    mode: 'demo',
    async get() { return { room: 'demo', tickets, clusters, helpedToday }; },
    async claim(id) { const t = find(id); t.status = 'going'; t.helpedAt = Date.now(); },
    async done(id) { const t = find(id); t.status = 'done'; t.doneAt = Date.now(); helpedToday++; },
    async postFix(cid) {
      const c = clusters.find((x) => x.id === cid);
      if (!c) return;
      for (const id of c.ticketIds) { const t = find(id); if (t.status !== 'done') { t.status = 'done'; helpedToday++; } }
      clusters = clusters.filter((x) => x.id !== cid);
    },
  };
}
