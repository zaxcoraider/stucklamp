import type { Room } from './store.ts';

const m = (ms: number) => `${Math.round(ms / 60000)} min`;

export function recapText(r: Room): string {
  const since = Date.now() - 12 * 3600_000;
  const ts = r.tickets.filter((t) => t.createdAt >= since && t.status !== 'cancelled');
  if (ts.length === 0) return '📋 **Session recap**: nobody asked for help yet.';
  const helped = ts.filter((t) => t.status === 'done');
  const waits = ts.filter((t) => t.helpedAt).map((t) => t.helpedAt! - t.createdAt);
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  const open = ts.filter((t) => t.status === 'waiting' || t.status === 'going');
  const byFix = helped.filter((t) => t.viaFix).length;
  const lines = [
    '📋 **Session recap**',
    `• Asked for help: **${ts.length}**  · helped: **${helped.length}**${byFix ? ` (${byFix} by one class-wide fix)` : ''}`,
    waits.length ? `• Average wait until a mentor was on the way: **${m(avg)}** (longest ${m(Math.max(...waits))})` : '',
    open.length ? `• Still waiting: ${open.map((t) => `seat ${t.seat} (${t.problem})`).join(', ')}` : '• Nobody left waiting 🎉',
  ];
  const notes = helped.filter((t) => t.note).map((t) => `  – ${t.problem} → ${t.note}`);
  if (notes.length) lines.push('• Mentor notes:', ...notes);
  return lines.filter(Boolean).join('\n');
}
