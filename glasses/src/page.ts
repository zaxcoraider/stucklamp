// The website around the lens: a classroom seen from above.
// Click a desk to make that student stuck; desks light up like lamps while they wait.
import type { QueueState } from './types';

const SEATS = 24;
const NAMES = ['Maya', 'Omar', 'Lena', 'Ravi', 'Sara', 'Tomás', 'Aiko', 'Jonas', 'Nia', 'Yusuf', 'Ines', 'Kai',
  'Priya', 'Leo', 'Hana', 'Sam', 'Zara', 'Ben', 'Mira', 'Ali', 'Eva', 'Noah', 'Lina', 'Theo'];
// The first two say the same thing in different words, so Claude has something to group.
const PROBLEMS = [
  'pip install flask says externally-managed-environment',
  'ModuleNotFoundError: No module named flask when I run python app.py',
  'my CSS grid items will not center',
  'git push rejected (non-fast-forward)',
  'pip install requests: permission denied in /usr/lib/python3',
  'TypeError: cannot read properties of undefined (reading map)',
];

let deps: {
  mode: 'server' | 'demo';
  add: (n: string, s: string, p: string) => Promise<{ ok: boolean; id?: string; position?: number; error?: string }>;
  selfSolve: (id: string) => Promise<boolean>;
  refresh: () => void;
} | null = null;
let lastAsked: { id: string; name: string } | null = null; // the student this visitor just played
let hintShownFor = '';
let clicks = 0;
let ownSeat = '12';
const helpedFlash = new Map<string, number>();
let lastSeen = new Map<string, string>(); // seat -> status, to notice "done"

function el<T extends HTMLElement>(id: string) { return document.getElementById(id) as T | null; }

function say(text: string, err = false) {
  const m = el<HTMLParagraphElement>('student-msg');
  if (!m) return;
  m.className = err ? 'msg err' : 'msg';
  m.textContent = text;
}

async function raise(seat: string, problem: string) {
  if (!deps) return;
  if (deps.mode === 'demo') { say('The live server is offline, so the glasses are showing a built-in demo class.', true); return; }
  const name = NAMES[(Number(seat) - 1) % NAMES.length] ?? 'Guest';
  say(`Seat ${seat}: sending…`);
  try {
    const r = await deps.add(name, seat, problem);
    if (r.ok) {
      say(`${name} (seat ${seat}) is #${r.position} in line. Watch the glasses. Claude is writing ${name} a hint…`);
      if (r.id) lastAsked = { id: r.id, name };
      deps.refresh();
    }
    else say(r.error ?? 'Could not raise a hand. Try again.', true);
  } catch { say('No connection to the server. Check your internet and try again.', true); }
}

export function initPage(d: NonNullable<typeof deps>) {
  deps = d;
  const desks = el<HTMLDivElement>('desks');
  if (desks && !desks.childElementCount) {
    for (let i = 1; i <= SEATS; i++) {
      if (i % 6 === 4) desks.appendChild(Object.assign(document.createElement('span'), { ariaHidden: 'true' })); // the aisle
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'desk'; b.dataset.seat = String(i);
      b.setAttribute('aria-label', `Seat ${i}, empty. Click to make this student stuck.`);
      b.innerHTML = `<span class="num">${i}</span><span class="who"></span>`;
      b.addEventListener('click', () => {
        const seat = String(i);
        ownSeat = seat; const l = el('own-seat-label'); if (l) l.textContent = seat;
        if (b.dataset.state === 'waiting' || b.dataset.state === 'going') { say(`Seat ${seat} is already in the queue.`); return; }
        void raise(seat, PROBLEMS[clicks++ % PROBLEMS.length]);
      });
      desks.appendChild(b);
    }
  }
  el<HTMLFormElement>('own-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el<HTMLInputElement>('own-problem');
    const p = input?.value.trim();
    if (!p) return;
    void raise(ownSeat, p);
    if (input) input.value = '';
  });
  const mode = el('mode');
  if (mode) mode.textContent = d.mode === 'server' ? 'Live: other visitors may be in this room too.' : 'Offline: built-in demo class.';
}

function showHint(id: string, name: string, hint: string) {
  const m = el<HTMLParagraphElement>('student-msg');
  if (!m || !deps) return;
  m.className = 'msg hint';
  m.innerHTML = '';
  const label = Object.assign(document.createElement('strong'), { textContent: `Hint Claude sent ${name} while they wait: ` });
  const text = document.createTextNode(hint + ' ');
  const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'textbtn', textContent: `${name} says: that fixed it` });
  btn.addEventListener('click', async () => {
    const ok = await deps!.selfSolve(id);
    say(ok ? `${name} solved it with the hint and left the queue. One less walk for the mentor.` : `${name} is no longer waiting.`);
    deps!.refresh();
  });
  m.append(label, text, btn);
}

export function paintRoom(q: QueueState, goingId: string | null) {
  if (lastAsked && hintShownFor !== lastAsked.id) {
    const t = q.tickets.find((x) => x.id === lastAsked!.id);
    if (t?.hint && t.status === 'waiting') { hintShownFor = t.id; showHint(t.id, lastAsked.name, t.hint); }
  }
  const now = Date.now();
  const bySeat = new Map(q.tickets.map((t) => [t.seat, t]));
  for (const [seat, status] of lastSeen) if (!bySeat.has(seat) && status !== 'helped') helpedFlash.set(seat, now + 2500);
  lastSeen = new Map([...bySeat].map(([s, t]) => [s, t.status]));
  document.querySelectorAll<HTMLButtonElement>('.desk').forEach((b) => {
    const seat = b.dataset.seat!;
    const t = bySeat.get(seat);
    const who = b.querySelector('.who')!;
    const flash = (helpedFlash.get(seat) ?? 0) > now;
    const state = t ? (t.status === 'going' || t.id === goingId ? 'going' : 'waiting') : flash ? 'helped' : '';
    if (state) b.dataset.state = state; else delete b.dataset.state;
    b.dataset.long = t && t.status === 'waiting' && now - t.createdAt > 5 * 60_000 ? '1' : '0';
    who.textContent = t ? t.name : flash ? 'helped' : '';
    b.setAttribute('aria-label', t ? `Seat ${seat}, ${t.name}: ${t.problem}. ${state === 'going' ? 'Mentor on the way.' : 'Waiting.'}` : `Seat ${seat}, empty. Click to make this student stuck.`);
  });
}
