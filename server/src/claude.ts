// Claude does two small jobs: shorten a student's problem for a 576px lens,
// and spot several students stuck on the same thing (with one fix for all).
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Ticket } from './store.ts';

const enabled = !!process.env.ANTHROPIC_API_KEY;
// ANTHROPIC_BASE_URL set = going through a third-party gateway (e.g. DGrid). The SDK reads it
// automatically; we switch to plain requests because gateways often drop beta features.
const gateway = !!process.env.ANTHROPIC_BASE_URL;
// DGrid expects the key as a Bearer token (Authorization header), not x-api-key.
const client = !enabled ? null
  : gateway ? new Anthropic({ apiKey: null, authToken: process.env.ANTHROPIC_API_KEY })
  : new Anthropic();
const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';

export const claudeOn = enabled;
export const claudeInfo = enabled ? `${MODEL}${gateway ? ' via gateway' : ''}` : 'off';

/** Gateway mode: ask for JSON in plain text and validate it ourselves. */
async function askPlain<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T> | null> {
  const res = await client!.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `${system}\nReply with only a JSON object matching this JSON Schema, no other text:\n${JSON.stringify(z.toJSONSchema(schema))}`,
    messages: [{ role: 'user', content: user }],
  });
  if (res.stop_reason === 'refusal') return null;
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

async function ask<T extends z.ZodType>(schema: T, system: string, user: string): Promise<z.infer<T> | null> {
  if (!client) return null;
  try {
    if (gateway) return await askPlain(schema, system, user);
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') return null;
    return (res.parsed_output as z.infer<T>) ?? null;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error('[claude] bad API key');
    else if (err instanceof Anthropic.RateLimitError) console.error('[claude] rate limited');
    else if (err instanceof Anthropic.APIError) console.error(`[claude] API error ${err.status}: ${err.message}`);
    else console.error('[claude]', err);
    return null;
  }
}

const Triage = z.object({ short: z.string(), hint: z.string() });

/**
 * One call per new request:
 * - short: fits the glasses ("ModuleNotFoundError: flask missing")
 * - hint: a nudge the student can try while waiting (not the full answer)
 */
export async function triage(raw: string): Promise<{ short: string; hint: string | null }> {
  const fallback = raw.length <= 38 ? raw : raw.slice(0, 37) + '…';
  const out = await ask(
    Triage,
    'A student in a hands-on class asked for help. Return two fields. ' +
      'short: the concrete problem in at most 38 characters for the teacher\'s smart-glasses display, keeping any error name or tool; no greeting, no name, no trailing period. ' +
      'hint: one nudge the student can try while waiting for the mentor, at most 180 characters, written to the student ("Check whether…", "Try…"). ' +
      'Point them in the right direction instead of giving the whole solution, so they still learn. ' +
      'If the request is too vague to hint at, ask them for the exact error message instead.',
    raw,
  );
  const s = out?.short.trim();
  const h = out?.hint.trim();
  return { short: s && s.length <= 42 ? s : fallback, hint: h ? h.slice(0, 220) : null };
}

const Insight = z.object({ top: z.array(z.string()), suggestion: z.string() });

/** End-of-session: what tripped people up, and one thing to teach differently next time. */
export async function insight(problems: string[]) {
  if (problems.length < 3) return null;
  return ask(
    Insight,
    'These are the help requests from one class session, one per line. ' +
      'top: up to 3 recurring problems, most common first, each under 60 characters with a count in brackets, e.g. "pip blocked outside a venv (5)". ' +
      'suggestion: one concrete thing the teacher could add to the start of the next class to prevent the most common problem, under 160 characters.',
    problems.join('\n'),
  );
}

const Groups = z.object({
  groups: z.array(z.object({
    ticketIds: z.array(z.string()),
    label: z.string(),
    fix: z.string(),
    glassesFix: z.string(),
  })),
});

/** Groups of >= minSize waiting tickets that share one root cause. */
export async function cluster(tickets: Ticket[], minSize: number) {
  if (tickets.length < minSize) return [];
  const list = tickets.map((t) => `${t.id}: ${t.rawProblem}`).join('\n');
  const out = await ask(
    Groups,
    'You help a teacher running a hands-on class. Below are open help requests (id: text). ' +
      `Find groups of ${minSize} or more requests that clearly share the same root cause, ` +
      'so one message to the whole class would unblock all of them. Only group when you are confident; ' +
      'different symptoms of different problems must not be grouped. For each group give: ticketIds, ' +
      'label (under 30 characters, e.g. "can\'t pip install"), fix (one or two short sentences a student can follow, under 160 characters), ' +
      'and glassesFix (the same fix in under 60 characters, for the teacher\'s glasses, e.g. "use a venv, then pip install"). ' +
      'Return an empty list if there is no such group.',
    list,
  );
  const known = new Set(tickets.map((t) => t.id));
  return (out?.groups ?? [])
    .map((g) => ({ ...g, ticketIds: [...new Set(g.ticketIds)].filter((id) => known.has(id)) }))
    .filter((g) => g.ticketIds.length >= minSize);
}
