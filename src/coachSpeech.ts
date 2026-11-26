// The Achird coach voice (#100): everything the coach says is made by Gemini through
// Firebase AI Logic in the Achird voice. Lines that never change are made once and kept
// (with the skill, or shipped with the app); the rest is streamed as it is said. No
// browser or Firebase calls here; speechLines.ts and useCoachVoice.ts do those.

// Picked on Nov 26 against the Achird sample Tino chose: the lite model matched its pace
// and pitch range, and its first streamed audio came in 0.5 s (1.0 s for the full model).
export const SPEECH_MODEL = 'gemini-3.8-flash-lite-tts'
export const SPEECH_VOICE = 'Achird'
// How the line is said; the model speaks only the text.
export const SPEECH_STYLE = 'calm and friendly, like a coach talking to someone at their workbench'

// The model's audio: 16 bit signed little endian samples, one channel, 24000 a second.
export const SAMPLE_RATE = 24000

// No audio this long after asking: the line is said in the on device voice instead.
export const FIRST_AUDIO_MS = 4000

// A saved line is split in parts of at most this many bytes (about 18 s each), so every
// part fits in a Firestore document (at most 1 MiB). Even, so no sample is split.
export const PART_BYTES = 900_000

// The name a line is kept under: its words with the model, voice and style that said them.
// New wording, or another voice, makes a new line, and an old one is never played for it.
export async function lineKey(text: string): Promise<string> {
  const data = new TextEncoder().encode([SPEECH_MODEL, SPEECH_VOICE, SPEECH_STYLE, text].join('\n'))
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Lines that are the same for every skill, shipped with the app as
// public/coach-voice/{key}.wav: "All steps done.", the wiring check failure, the reply
// failures and the voice notes. Made on Nov 26 with the settings above.
export const SHARED_LINE_KEYS: ReadonlySet<string> = new Set<string>([
  'f39c6c341eebe8033e8061d13398e3ba', // All steps done.
  '653d0d8be66b11bb5fb87177acfe660f', // The wiring check is not available right now. Ask an expert in the chat
  'fef1d1e84cd592a16e5f1d4a24e48706', // Answers are limited right now.
  '5e80eb4642d5c711d8caf8a9ad77557e', // Could not answer right now.
  '7e8ae3ed15f78e8d8ddd9a74aa820a57', // The AI could not answer right now. Try again, or ask an expert.
  '553d30491ba33733b86940f4220f88e5', // Heard you, but that didn't sound like it was about this step. Try agai
  'fe2e81fd05e7ce5616036ad19ab405e7', // That was about the step you just left. Ask again if you still need it.
  '8a493af5ca963cca2b5e653921d4d47a', // Couldn't check that on this device. Type it instead.
])

export function sharedLineUrl(key: string): string {
  return `/coach-voice/${key}.wav`
}

// The samples of a WAV file (the PCM in its data chunk), or null when it is not one.
export function wavSamples(file: Uint8Array): Uint8Array | null {
  const text = (at: number) => String.fromCharCode(...file.subarray(at, at + 4))
  if (file.length < 12 || text(0) !== 'RIFF' || text(8) !== 'WAVE') return null
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  let at = 12
  while (at + 8 <= file.length) {
    const size = view.getUint32(at + 4, true)
    if (text(at) === 'data') return file.subarray(at + 8, Math.min(file.length, at + 8 + size))
    at += 8 + size + (size % 2)
  }
  return null
}

// Turns streamed audio into samples for Web Audio. A chunk can end halfway through a
// sample: that byte waits for the next chunk.
export function pcmReader(): (bytes: Uint8Array) => Float32Array<ArrayBuffer> {
  let carry: number | null = null
  return (bytes) => {
    let all = bytes
    if (carry !== null) {
      all = new Uint8Array(bytes.length + 1)
      all[0] = carry
      all.set(bytes, 1)
    }
    const whole = all.length - (all.length % 2)
    carry = whole < all.length ? all[whole] : null
    const view = new DataView(all.buffer, all.byteOffset, whole)
    const samples = new Float32Array(whole / 2)
    for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768
    return samples
  }
}

// One line's audio in parts for saving; a line with no audio has no parts.
export function splitParts(audio: Uint8Array, size = PART_BYTES): Uint8Array[] {
  const parts: Uint8Array[] = []
  for (let at = 0; at < audio.length; at += size) parts.push(audio.subarray(at, at + size))
  return parts
}

export type SavedPart = { key: string; part: number; parts: number; audio: Uint8Array }

// The saved lines of a step, whole: a line with a part missing is left out (it is made
// again when said).
export function joinParts(saved: readonly SavedPart[]): Map<string, Uint8Array> {
  const byKey = new Map<string, SavedPart[]>()
  for (const p of saved) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p])
  const lines = new Map<string, Uint8Array>()
  for (const [key, parts] of byKey) {
    const count = parts[0].parts
    const ordered: Uint8Array[] = []
    for (let i = 0; i < count; i++) {
      const p = parts.find((x) => x.part === i && x.parts === count)
      if (!p) break
      ordered.push(p.audio)
    }
    if (ordered.length !== count || count === 0) continue
    const audio = new Uint8Array(ordered.reduce((n, a) => n + a.length, 0))
    let at = 0
    for (const a of ordered) {
      audio.set(a, at)
      at += a.length
    }
    lines.set(key, audio)
  }
  return lines
}

// Whether the coach can speak: online, Achird plays in any browser with Web Audio;
// offline, only an on device voice can. undefined while the device voices still load.
export function coachCanSpeak(s: { online: boolean; webAudio: boolean; deviceVoice: boolean | undefined }): boolean | null {
  if (s.online && s.webAudio) return true
  if (s.deviceVoice === undefined) return null
  return s.deviceVoice
}
