import type { Room } from './store.ts';
import { insight } from './claude.ts';

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
  const self = helped.filter((t) => t.selfSolved).length;
  const lines = [
    '📋 **Session recap**',
    `• Asked for help: **${ts.length}**  · solved: **${helped.length}**${byFix ? ` (${byFix} by one class-wide fix)` : ''}${self ? ` · **${self}** fixed it themselves with Claude's hint` : ''}`,
    waits.length ? `• Average wait until a mentor was on the way: **${m(avg)}** (longest ${m(Math.max(...waits))})` : '',
    open.length ? `• Still waiting: ${open.map((t) => `seat ${t.seat} (${t.problem})`).join(', ')}` : '• Nobody left waiting 🎉',
  ];
  const notes = helped.filter((t) => t.note).map((t) => `  – ${t.problem} → ${t.note}`);
  if (notes.length) lines.push('• Mentor notes:', ...notes);
  return lines.filter(Boolean).join('\n');
}

/** Recap plus Claude's view of what tripped the class up (if there is enough to say). */
export async function recapWithInsight(r: Room): Promise<string> {
  const base = recapText(r);
  const since = Date.now() - 12 * 3600_000;
  const problems = r.tickets.filter((t) => t.createdAt >= since && t.status !== 'cancelled').map((t) => t.rawProblem);
  const i = await insight(problems);
  if (!i || !i.top.length) return base;
  return `${base}\n\n🧭 **What tripped the class up**\n${i.top.map((x) => `  – ${x}`).join('\n')}\n**Next class:** ${i.suggestion}`;
}
