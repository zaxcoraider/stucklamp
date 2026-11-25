import './style.css';
import {
  AudioInputSource,
  CreateStartUpPageContainer,
  OsEventTypeList,
  RebuildPageContainer,
  StartUpPageCreateResult,
  TextContainerProperty,
  TextContainerUpgrade,
  waitForEvenAppBridge,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import { addTicket, connect, MENTOR, resetRoom, ROOM, selfSolve, type Api } from './api';
import { initPage, paintRoom } from './page';
import { clusterCard, emptyCard, flash, goingCard, queueCard, waiting } from './screens';
import type { QueueState } from './types';

type Input = 'tap' | 'next' | 'prev' | 'double' | 'hold' | 'release';

// ---------- state ----------
let api: Api;
let q: QueueState = { room: '', tickets: [], clusters: [], helpedToday: 0 };
let cursor = 0;                    // index into waiting list
let goingId: string | null = null; // ticket the mentor is walking to
const skippedClusters = new Set<string>();
const parkedGoing = new Set<string>(); // 'going' tickets the mentor stepped back from
let flashUntil = 0;
let flashText = '';
// voice note recording (hold on the "going" screen, release to save)
let recording = false;
let pcm: Uint8Array[] = [];
let recTimer: ReturnType<typeof setTimeout> | null = null;

// ---------- output: glasses + browser preview ----------
const lens = document.getElementById('lens') as HTMLPreElement;
let bridge: EvenAppBridge | null = null;
let lastText = '';

async function show(text: string) {
  if (text === lastText) return;
  lastText = text;
  lens.textContent = text;
  if (bridge) {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: 1, containerName: 'main', content: text }));
  }
}

function screen(): string {
  const now = Date.now();
  if (recording) return ['', '', '   ● Recording a note…', '', '   Say what fixed it.', '   Let go to save.'].join('\n');
  if (now < flashUntil) return flashText;
  if (!goingId) {
    // After a reload, resume the student we were walking to.
    const g = q.tickets.filter((x) => x.status === 'going' && (!x.claimedBy || x.claimedBy === MENTOR) && !parkedGoing.has(x.id))
      .sort((a, b) => (b.helpedAt ?? 0) - (a.helpedAt ?? 0))[0];
    if (g) goingId = g.id;
  }
  if (goingId) {
    const t = q.tickets.find((x) => x.id === goingId);
    if (t && t.status === 'going') return goingCard(t, now);
    goingId = null;
  }
  const cluster = q.clusters.find((c) => !skippedClusters.has(c.id));
  if (cluster) return clusterCard(cluster);
  const list = waiting(q);
  if (list.length === 0) return emptyCard(q);
  cursor = Math.min(cursor, list.length - 1);
  return queueCard(q, list[cursor], cursor, list.length, now);
}

function render() { void show(screen()); paintRoom(q, goingId); }

function say(msg: string, ms = 1500) {
  flashText = flash(msg);
  flashUntil = Date.now() + ms;
  render();
  setTimeout(render, ms + 10);
}

async function refresh() {
  try { q = await api.get(); } catch (e) { console.warn('refresh failed', e); }
  render();
}

// ---------- input ----------
async function handle(input: Input) {
  if (recording && input !== 'release') return;
  if (Date.now() < flashUntil && input !== 'release') return;
  if (goingId) {
    if (input === 'tap') { await api.done(goingId); goingId = null; cursor = 0; say('Marked as helped'); }
    else if (input === 'double') { parkedGoing.add(goingId); goingId = null; }
    else if (input === 'hold') { await startNote(); return; }
    else if (input === 'release') { await stopNote(); return; }
    return refresh();
  }
  const cluster = q.clusters.find((c) => !skippedClusters.has(c.id));
  if (cluster) {
    if (input === 'tap') { await api.postFix(cluster.id); say(`Fix posted to class (${cluster.ticketIds.length})`); }
    else if (input === 'next' || input === 'prev') { skippedClusters.add(cluster.id); }
    return refresh();
  }
  const list = waiting(q);
  if (input === 'double' && list.length === 0) { await bridge?.shutDownPageContainer(1); return; }
  if (list.length === 0) return render();
  if (input === 'next') cursor = (cursor + 1) % list.length;
  if (input === 'prev') cursor = (cursor - 1 + list.length) % list.length;
  if (input === 'tap') {
    const t = list[cursor];
    try {
      await api.claim(t.id);
      goingId = t.id;
      say(`Seat ${t.seat} knows you're coming`);
    } catch {
      say(`Another mentor is going to seat ${t.seat}`); // two pairs of glasses, one student
    }
  }
  return refresh();
}

async function startNote() {
  if (!bridge) { say('Voice notes need the glasses mic'); return; }
  if (!goingId) return;
  pcm = []; recording = true; render();
  await bridge.audioControl(true, AudioInputSource.Glasses);
  recTimer = setTimeout(() => void stopNote(), 15_000); // notes are short; stop by itself
}

async function stopNote() {
  if (!recording) return;
  recording = false;
  if (recTimer) { clearTimeout(recTimer); recTimer = null; }
  await bridge?.audioControl(false);
  const id = goingId;
  const total = pcm.reduce((n, c) => n + c.length, 0);
  const all = new Uint8Array(total); let o = 0; for (const c of pcm) { all.set(c, o); o += c.length; }
  pcm = [];
  if (!id || total < 8000) { say('Note too short, nothing saved'); return; }
  say('Saving note…', 8000);
  try {
    const r = await api.voice(id, all);
    if (r.ok) { goingId = null; cursor = 0; say(`Saved: "${(r.note ?? '').slice(0, 60)}"`, 2500); }
    else say(r.error ?? 'Could not save the note', 2000);
  } catch { say('Could not save the note', 2000); }
  void refresh();
}

function fromHub(ev: EvenHubEvent): Input | null {
  if (ev.audioEvent) { if (recording) pcm.push(ev.audioEvent.audioPcm); return null; }
  const src = ev.textEvent ?? ev.listEvent ?? ev.sysEvent;
  if (!src) return null;
  // CLICK_EVENT is 0 and protobuf may drop zero values, so a bare event = tap.
  const type = src.eventType ?? OsEventTypeList.CLICK_EVENT;
  switch (type) {
    case OsEventTypeList.CLICK_EVENT: return 'tap';
    case OsEventTypeList.DOUBLE_CLICK_EVENT: return 'double';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: return 'next';
    case OsEventTypeList.SCROLL_TOP_EVENT: return 'prev';
    case OsEventTypeList.LONG_PRESS_EVENT: return 'hold';
    case OsEventTypeList.LONG_PRESS_RELEASE_EVENT: return 'release';
    case OsEventTypeList.FOREGROUND_ENTER_EVENT: void refresh(); return null;
    default: return null;
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('input, textarea, button')) return; // typing in the student form
  const map: Record<string, Input> = { Enter: 'tap', ArrowDown: 'next', ArrowUp: 'prev', ' ': 'double', l: 'hold' };
  const i = map[e.key];
  if (i) { e.preventDefault(); void handle(i); }
});

// ---------- browser "try it" page ----------
function wirePage() {
  document.querySelectorAll<HTMLButtonElement>('[data-in]').forEach((b) =>
    b.addEventListener('click', () => void handle(b.dataset.in as Input)));
  document.getElementById('reset')?.addEventListener('click', async () => {
    await resetRoom(); goingId = null; parkedGoing.clear(); skippedClusters.clear(); cursor = 0; void refresh();
  });
  initPage({ mode: api.mode, add: addTicket, selfSolve, refresh: () => void refresh() });
}

// ---------- boot ----------
async function boot() {
  api = await connect();
  // Only talk to glasses inside the Even app / simulator (they inject this handler).
  // In a normal browser the SDK still resolves, so check for the host ourselves.
  // The host may inject it shortly after load, so wait up to 2 s.
  const hasHost = () => !!(window as unknown as { flutter_inappwebview?: { callHandler?: unknown } }).flutter_inappwebview?.callHandler;
  for (let i = 0; i < 20 && !hasHost(); i++) await new Promise((r) => setTimeout(r, 100));
  const inEvenApp = hasHost() && !new URLSearchParams(location.search).has('web'); // ?web = force website view
  bridge = !inEvenApp ? null : await Promise.race([
    waitForEvenAppBridge(),
    new Promise<null>((r) => setTimeout(() => r(null), 2000)),
  ]);
  if (bridge) {
    const page = {
      containerTotalNum: 1,
      textObject: [new TextContainerProperty({
        xPosition: 0, yPosition: 0, width: 576, height: 288,
        containerID: 1, containerName: 'main', content: 'Stucklamp', isEventCapture: 1,
      })],
    };
    const res = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page));
    // A page may already exist (e.g. after a reload): rebuild it instead.
    if (res !== StartUpPageCreateResult.success && !(await bridge.rebuildPageContainer(new RebuildPageContainer(page)))) {
      console.warn('glasses page setup failed', res);
    }
    bridge.onEvenHubEvent((ev) => { const i = fromHub(ev); if (i) void handle(i); });
  }
  if (bridge) document.body.dataset.glasses = 'on';
  const mode = document.getElementById('mode');
  if (mode) mode.textContent = api.mode === 'server' ? `live · room "${ROOM}"` : 'offline demo class';
  wirePage();
  console.log(`Stucklamp: ${api.mode} mode, room ${ROOM}, glasses bridge ${bridge ? 'on' : 'off'}`);
  await refresh();
  setInterval(refresh, 3000);
  setInterval(render, 15000); // keep "waiting Xm" fresh
}

void boot();
