// Voice notes: the mentor holds the touchpad and says "fixed, missing venv".
// Audio is transcribed on our own server with whisper.cpp, so it never goes to a third party.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.WHISPER_BIN ?? '/opt/stucklamp/whisper/whisper.cpp/build/bin/whisper-cli';
const MODEL = process.env.WHISPER_MODEL ?? '/opt/stucklamp/whisper/whisper.cpp/models/ggml-tiny.en.bin';
export const voiceOn = () => existsSync(BIN) && existsSync(MODEL);

/** 16-bit little-endian mono PCM -> WAV file bytes. */
function wav(pcm: Buffer, rate = 16000): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export async function transcribe(pcm: Buffer, rate = 16000): Promise<string | null> {
  if (!voiceOn() || pcm.length < rate / 2) return null; // under a quarter second: nothing said
  const file = join(tmpdir(), `note-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
  await writeFile(file, wav(pcm, rate));
  try {
    const out = await new Promise<string>((resolve, reject) =>
      execFile(BIN, ['-m', MODEL, '-f', file, '-nt', '-np', '-l', 'en', '-t', '2'], { timeout: 30_000 }, (err, stdout) => (err ? reject(err) : resolve(stdout))));
    const text = out.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    return text || null;
  } catch (e) {
    console.error('[voice]', (e as Error).message);
    return null;
  } finally {
    await rm(file, { force: true });
  }
}
