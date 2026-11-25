// Pure functions: state -> text for the 576x288 lens. Keep every line short.
import type { Cluster, QueueState, Ticket } from './types';

export const LINE = 40; // chars per line that fit comfortably on G2 at default size

export function mins(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 1 ? '<1m' : `${m}m`;
}

function clip(s: string, n = LINE): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function waiting(q: QueueState): Ticket[] {
  return q.tickets
    .filter((t) => t.status === 'waiting')
    .sort((a, b) => a.createdAt - b.createdAt); // longest wait first
}

export function header(q: QueueState): string {
  const n = waiting(q).length;
  const others = q.tickets.filter((t) => t.status === 'going').length;
  return `STUCKLAMP · ${n} waiting${others ? ` · ${others} on the way` : ''} · ${q.helpedToday} helped`;
}

export function queueCard(q: QueueState, t: Ticket, idx: number, total: number, now: number): string {
  return [
    header(q),
    '',
    clip(`> Seat ${t.seat} · ${t.name}`),
    clip(`  ${t.problem}`),
    `  waiting ${mins(now - t.createdAt)}   (${idx + 1}/${total})`,
    '',
    'tap: on my way   swipe: next',
  ].join('\n');
}

export function goingCard(t: Ticket, now: number): string {
  return [
    `GOING TO SEAT ${t.seat}`,
    '',
    clip(`${t.name}: ${t.problem}`),
    `told them you're coming · ${mins(now - (t.helpedAt ?? now))} ago`,
    '',
    'tap: done   hold: voice note',
    'double-tap: back to queue',
  ].join('\n');
}

export function clusterCard(c: Cluster): string {
  return [
    `${c.ticketIds.length} STUCK ON THE SAME THING`,
    '',
    clip(c.label),
    clip(`fix: ${c.fix}`, LINE * 2),
    '',
    'tap: post fix to class   swipe: skip',
  ].join('\n');
}

export function emptyCard(q: QueueState): string {
  const self = q.selfSolvedToday ? `   ${q.selfSolvedToday} fixed it themselves with a hint.` : '';
  return [header(q), '', '', '   Nobody is stuck right now.', self, '', 'double-tap: exit'].join('\n');
}

export function flash(msg: string): string {
  return ['', '', '', `   ${clip(msg, LINE - 3)}`].join('\n');
}
