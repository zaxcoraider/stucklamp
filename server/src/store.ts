// In-memory class queue with a JSON snapshot so a restart mid-class loses nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type TicketStatus = 'waiting' | 'going' | 'done' | 'cancelled';

export interface Ticket {
  id: string;
  seat: string;
  name: string;
  problem: string;     // short version shown on the glasses
  rawProblem: string;  // what the student typed
  createdAt: number;
  status: TicketStatus;
  helpedAt?: number;
  doneAt?: number;
  note?: string;
  viaFix?: string;     // cluster id if solved by a class-wide fix
  hint?: string;       // Claude's nudge sent to the student while waiting
  selfSolved?: boolean; // student fixed it with the hint before a mentor came
  claimedBy?: string;  // which mentor's glasses tapped "on my way"
  // Routing back to the student (never sent to the glasses)
  platform?: 'discord' | 'telegram' | 'web';
  tg?: { chat: number; user: number; msg: number };
  userId: string;
  channelId: string;
}

export interface Cluster {
  id: string;
  label: string;
  ticketIds: string[];
  fix: string;
  glassesFix?: string;
}

export interface Room {
  id: string;
  tickets: Ticket[];
  clusters: Cluster[];
}

const FILE = new URL('../data.json', import.meta.url);
const rooms = new Map<string, Room>();

if (existsSync(FILE)) {
  for (const r of JSON.parse(readFileSync(FILE, 'utf8')) as Room[]) rooms.set(r.id, r);
}

let saveTimer: NodeJS.Timeout | null = null;
export function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeFileSync(FILE, JSON.stringify([...rooms.values()], null, 1));
  }, 300);
}

export function room(id: string): Room {
  let r = rooms.get(id);
  if (!r) { r = { id, tickets: [], clusters: [] }; rooms.set(id, r); }
  return r;
}

export const waitingOf = (r: Room) => r.tickets.filter((t) => t.status === 'waiting');

/** What the glasses get: no Discord ids. */
export function publicView(r: Room) {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  return {
    room: r.id,
    tickets: r.tickets
      .filter((t) => t.status === 'waiting' || t.status === 'going')
      .map(({ id, seat, name, problem, createdAt, status, helpedAt, hint, claimedBy }) => ({ id, seat, name, problem, createdAt, status, helpedAt, hint, claimedBy })),
    clusters: r.clusters.map(({ id, label, ticketIds, fix, glassesFix }) => ({ id, label, ticketIds, fix: glassesFix || fix })),
    helpedToday: r.tickets.filter((t) => t.status === 'done' && !t.selfSolved && (t.doneAt ?? 0) >= startOfDay.getTime()).length,
    selfSolvedToday: r.tickets.filter((t) => t.selfSolved && (t.doneAt ?? 0) >= startOfDay.getTime()).length,
  };
}

let seq = Date.now() % 100000;
export const newId = (p: string) => `${p}${(seq++).toString(36)}`;
