// Stucklamp server: HTTP API for the glasses + Discord bot + Claude.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { claudeInfo, claudeOn, cluster, triage } from './claude.ts';
import { postToClass, sendHint, startDiscord, tell } from './discord.ts';
import { newId, publicView, room, save, waitingOf, type Ticket } from './store.ts';
import { transcribe, voiceOn } from './voice.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MIN_CLUSTER = Number(process.env.MIN_CLUSTER ?? 2);
const PUBLIC_ROOM = process.env.PUBLIC_ROOM ?? 'try'; // the "try it" page; anyone may reset it
const MAX_WAITING = 30;

// Simple per-IP limit for the public web form (each ticket costs a Claude call).
const hits = new Map<string, number[]>();
function allowed(ip: string, perMinute = 6): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) { hits.set(ip, recent); return false; }
  recent.push(now); hits.set(ip, recent);
  return true;
}
const clientIp = (req: IncomingMessage) =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';

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
  const { short, hint } = await triage(t.rawProblem);
  t.problem = short;
  if (hint && t.status === 'waiting') { t.hint = hint; void sendHint(t); }
  save();
  if (claudeOn) scheduleCluster(roomId);
}

// ---------- actions from the glasses ----------
async function claim(roomId: string, id: string, mentor?: string) {
  const t = room(roomId).tickets.find((x) => x.id === id);
  if (!t || t.status !== 'waiting') return false; // another mentor got there first
  t.status = 'going'; t.helpedAt = Date.now(); t.claimedBy = mentor?.slice(0, 24); save();
  void tell(t, '🏃 **A mentor is on the way to you now.**');
  return true;
}

/** The student fixed it with Claude's hint before a mentor came. */
export function selfSolve(roomId: string, id: string, fromWeb = false) {
  const t = room(roomId).tickets.find((x) => x.id === id);
  if (!t || t.status !== 'waiting') return false;
  if (fromWeb && t.userId) return false; // Discord students confirm with their own button
  t.status = 'done'; t.selfSolved = true; t.doneAt = Date.now(); save();
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
  if (url.pathname === '/health') return send(res, 200, { ok: true, claude: claudeOn, voice: voiceOn() });
  const voice = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/tickets\/([\w-]+)\/voice$/);
  if (voice && req.method === 'POST') {
    // Raw 16-bit mono PCM from the glasses mic. Saved as the mentor's note, then the ticket is done.
    if (!voiceOn()) return send(res, 501, { ok: false, error: 'Voice notes are not set up on this server.' });
    const chunks: Buffer[] = []; let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > 2_000_000) return send(res, 413, { ok: false, error: 'Note too long (max ~60 s).' }); chunks.push(c as Buffer); }
    const rate = Number(url.searchParams.get('rate') ?? 16000) || 16000;
    const text = await transcribe(Buffer.concat(chunks), rate);
    if (!text) return send(res, 422, { ok: false, error: 'Could not hear a note.' });
    await done(voice[1], voice[2], text);
    return send(res, 200, { ok: true, note: text });
  }
  const reset = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/reset$/);
  if (reset && req.method === 'POST') {
    if (reset[1] !== PUBLIC_ROOM) return send(res, 403, { error: 'only the public demo room can be reset' });
    const r = room(reset[1]); r.tickets = []; r.clusters = []; save();
    return send(res, 200, { ok: true });
  }
  const web = url.pathname.match(/^\/api\/rooms\/([\w-]+)\/tickets$/);
  if (web && req.method === 'POST') {
    // Students without Discord (e.g. Demo Day QR page) can join the same queue.
    if (!allowed(clientIp(req))) return send(res, 429, { ok: false, error: 'Slow down: max 6 requests a minute.' });
    if (waitingOf(room(web[1])).length >= MAX_WAITING) return send(res, 429, { ok: false, error: 'The queue is full. Tap through some students first.' });
    const b = await body(req);
    const raw = String(b.problem ?? '').trim().slice(0, 300);
    if (!raw) return send(res, 400, { ok: false, error: 'Please describe the problem.' });
    const t: Ticket = {
      id: newId('t'), seat: String(b.seat ?? '?').slice(0, 12) || '?', name: String(b.name ?? 'Guest').slice(0, 24) || 'Guest',
      problem: raw, rawProblem: raw, createdAt: Date.now(), status: 'waiting', userId: '', channelId: process.env.CLASS_CHANNEL_ID ?? '',
    };
    room(web[1]).tickets.push(t); save();
    void onNewTicket(web[1], t);
    return send(res, 200, { ok: true, id: t.id, position: waitingOf(room(web[1])).length });
  }
  const m = url.pathname.match(/^\/api\/rooms\/([\w-]+)(?:\/(tickets|clusters)\/([\w-]+)\/(claim|done|post|selfsolve))?$/);
  if (!m) return send(res, 404, { error: 'not found' });
  const [, roomId, , id, action] = m;
  try {
    if (!action && req.method === 'GET') return send(res, 200, publicView(room(roomId)));
    if (!action) return send(res, 405, { error: 'method' });
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = await body(req);
    const ok = action === 'claim' ? await claim(roomId, id, typeof b.mentor === 'string' ? b.mentor : undefined)
      : action === 'selfsolve' ? selfSolve(roomId, id, true)
      : action === 'done' ? await done(roomId, id, typeof b.note === 'string' ? b.note : undefined)
      : await postFix(roomId, id);
    return send(res, ok ? 200 : 409, { ok });
  } catch (e) {
    console.error('[http]', e);
    return send(res, 500, { error: 'server error' });
  }
}).listen(PORT, () => console.log(`[http] listening on http://localhost:${PORT}  (Claude: ${claudeInfo})`));

if (process.env.DISCORD_TOKEN && process.env.DISCORD_APP_ID) {
  startDiscord({ onNewTicket: (r, t) => void onNewTicket(r, t), onSelfSolved: (r, id) => selfSolve(r, id) }).catch((e) => console.error('[discord] login failed:', e.message));
} else {
  console.warn('[discord] off: DISCORD_TOKEN / DISCORD_APP_ID missing in .env');
}
