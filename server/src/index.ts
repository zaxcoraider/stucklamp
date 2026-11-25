// Stucklamp server: HTTP API for the glasses + Discord bot + Claude.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { claudeInfo, claudeOn, cluster, shorten } from './claude.ts';
import { postToClass, startDiscord, tell } from './discord.ts';
import { newId, publicView, room, save, waitingOf, type Ticket } from './store.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MIN_CLUSTER = Number(process.env.MIN_CLUSTER ?? 2);

// ---------- Claude jobs (debounced so a burst of /stuck = one clustering call) ----------
const clusterTimers = new Map<string, NodeJS.Timeout>();
function scheduleCluster(roomId: string) {
  clearTimeout(clusterTimers.get(roomId));
  clusterTimers.set(roomId, setTimeout(async () => {
    const r = room(roomId);
    const busy = new Set(r.clusters.flatMap((c) => c.ticketIds));
    const free = waitingOf(r).filter((t) => !busy.has(t.id));
    const groups = await cluster(free, MIN_CLUSTER);
    for (const g of groups) r.clusters.push({ id: newId('c'), ...g });
    if (groups.length) { console.log(`[claude] ${groups.length} new group(s)`); save(); }
  }, 2500));
}

async function onNewTicket(roomId: string, t: Ticket) {
  t.problem = await shorten(t.rawProblem); save();
  if (claudeOn) scheduleCluster(roomId);
}

// ---------- actions from the glasses ----------
async function claim(roomId: string, id: string) {
  const t = room(roomId).tickets.find((x) => x.id === id);
  if (!t || t.status !== 'waiting') return false;
  t.status = 'going'; t.helpedAt = Date.now(); save();
  void tell(t, '🏃 **A mentor is on the way to you now.**');
  return true;
}

async function done(roomId: string, id: string, note?: string) {
  const t = room(roomId).tickets.find((x) => x.id === id);
  if (!t) return false;
  t.status = 'done'; t.doneAt = Date.now(); if (note) t.note = note.slice(0, 200); save();
  return true;
}

async function postFix(roomId: string, cid: string) {
  const r = room(roomId);
  const c = r.clusters.find((x) => x.id === cid);
  if (!c) return false;
  const ts = c.ticketIds.map((id) => r.tickets.find((t) => t.id === id)).filter((t): t is Ticket => !!t && t.status === 'waiting');
  r.clusters = r.clusters.filter((x) => x.id !== cid);
  if (ts.length) {
    const mentions = ts.map((t) => (t.userId ? `<@${t.userId}>` : t.name)).join(' ');
    await postToClass(ts.find((t) => t.channelId)?.channelId ?? '', `💡 ${mentions}: ${ts.length} of you hit the same problem (**${c.label}**).\n${c.fix}\nStill stuck after trying this? Use \`/stuck\` again and a mentor will come over.`);
    const now = Date.now();
    for (const t of ts) { t.status = 'done'; t.helpedAt ??= now; t.doneAt = now; t.viaFix = cid; }
  }
  save();
  return true;
}

// ---------- HTTP ----------
function send(res: ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<any> {
  let s = '';
  for await (const c of req) { s += c; if (s.length > 10_000) break; }
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') return send(res, 200, { ok: true, claude: claudeOn });
  const web = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/tickets$/);
  if (web && req.method === 'POST') {
    // Students without Discord (e.g. Demo Day QR page) can join the same queue.
    const b = await body(req);
    const raw = String(b.problem ?? '').trim().slice(0, 300);
    if (!raw) return send(res, 400, { error: 'problem required' });
    const t: Ticket = {
      id: newId('t'), seat: String(b.seat ?? '?').slice(0, 12) || '?', name: String(b.name ?? 'Guest').slice(0, 24) || 'Guest',
      problem: raw, rawProblem: raw, createdAt: Date.now(), status: 'waiting', userId: '', channelId: process.env.CLASS_CHANNEL_ID ?? '',
    };
    room(web[1]).tickets.push(t); save();
    void onNewTicket(web[1], t);
    return send(res, 200, { ok: true, id: t.id, position: waitingOf(room(web[1])).length });
  }
  const m = url.pathname.match(/^\/api\/rooms\/([\w-]+)(?:\/(tickets|clusters)\/([\w-]+)\/(claim|done|post))?$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const [, roomId, , id, action] = m;
  try {
    if (!action && req.method === 'GET') return send(res, 200, publicView(room(roomId)));
    if (!action) return send(res, 405, { error: 'method' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = await body(req);
    const ok = action === 'claim' ? await claim(roomId, id)
      : action === 'done' ? await done(roomId, id, typeof b.note === 'string' ? b.note : undefined)
      : await postFix(roomId, id);
    return send(res, ok ? 200 : 409, { ok });
  } catch (e) {
    console.error('[http]', e);
    return send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log(`[http] listening on http://localhost:${PORT}  (Claude: ${claudeInfo})`));

if (process.env.DISCORD_TOKEN && process.env.DISCORD_APP_ID) {
  startDiscord({ onNewTicket: (r, t) => void onNewTicket(r, t) }).catch((e) => console.error('[discord] login failed:', e.message));
} else {
  console.warn('[discord] off: DISCORD_TOKEN / DISCORD_APP_ID missing in .env');
}
