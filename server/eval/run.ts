// Measures how well Claude groups same-root-cause requests and shortens them for the glasses.
// Usage (from server/): node --env-file=.env --env-file-if-exists=.env.gateway eval/run.ts [runs]
import { readFileSync, writeFileSync } from 'node:fs';
import { cluster, triage } from '../src/claude.ts';
import type { Ticket } from '../src/store.ts';

type Req = { text: string; group: string };
const data = JSON.parse(readFileSync(new URL('./classes.json', import.meta.url), 'utf8')) as { classes: { name: string; requests: Req[] }[] };
const RUNS = Number(process.argv[2] ?? 3);
const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

let tp = 0, fp = 0, fn = 0, wrongPairs: string[] = [];
const rows: string[] = [];
for (let run = 1; run <= RUNS; run++) {
  for (const c of data.classes) {
    const tickets = c.requests.map((r, i) => ({ id: `r${i}`, rawProblem: r.text }) as Ticket);
    const t0 = Date.now();
    const groups = await cluster(tickets, 2);
    const ms = Date.now() - t0;
    const predicted = new Set<string>();
    for (const g of groups) for (let i = 0; i < g.ticketIds.length; i++) for (let j = i + 1; j < g.ticketIds.length; j++) predicted.add(key(g.ticketIds[i], g.ticketIds[j]));
    const truth = new Set<string>();
    c.requests.forEach((a, i) => c.requests.forEach((b, j) => { if (i < j && a.group === b.group) truth.add(key(`r${i}`, `r${j}`)); }));
    let ctp = 0;
    for (const p of predicted) {
      if (truth.has(p)) ctp++;
      else { fp++; const [x, y] = p.split('|').map((id) => c.requests[Number(id.slice(1))].text); wrongPairs.push(`"${x}" + "${y}"`); }
    }
    tp += ctp; fn += [...truth].filter((p) => !predicted.has(p)).length;
    rows.push(`run ${run} · ${c.name}: ${groups.length} groups, ${ctp}/${predicted.size} grouped pairs correct, ${ms} ms`);
    console.log(rows.at(-1));
  }
}
const precision = tp / Math.max(1, tp + fp), recall = tp / Math.max(1, tp + fn);

// Shortening + hints: every request once.
const all = data.classes.flatMap((c) => c.requests.map((r) => r.text));
const lens: number[] = []; let hints = 0; const t0 = Date.now();
for (const text of all) { const r = await triage(text); lens.push(r.short.length); if (r.hint) hints++; }
const triageMs = Math.round((Date.now() - t0) / all.length);

const summary = [
  `# Stucklamp eval (${new Date().toISOString().slice(0, 10)})`,
  '',
  `Dataset: ${all.length} synthetic beginner help requests in ${data.classes.length} classes (eval/classes.json). Runs: ${RUNS}.`,
  '',
  '| Measure | Result |',
  '|---|---|',
  `| Grouping precision (grouped pairs that truly share a cause) | **${precision.toFixed(2)}** |`,
  `| Grouping recall (true same-cause pairs that were grouped) | **${recall.toFixed(2)}** |`,
  `| Shortened text fits the glasses (≤ 42 chars) | **${lens.filter((l) => l <= 42).length}/${lens.length}** (longest ${Math.max(...lens)}) |`,
  `| Requests that got a hint | **${hints}/${all.length}** |`,
  `| Average time to shorten + hint one request | ${triageMs} ms |`,
  '',
  '## Per run', ...rows.map((r) => `- ${r}`),
  '', '## Wrongly grouped pairs', ...(wrongPairs.length ? wrongPairs.map((w) => `- ${w}`) : ['- none']),
].join('\n');
writeFileSync(new URL('./RESULTS.md', import.meta.url), summary + '\n');
console.log('\n' + summary);
