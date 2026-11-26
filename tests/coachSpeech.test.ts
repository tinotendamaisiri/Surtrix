import { describe, expect, test } from 'vitest'
import {
  coachCanSpeak,
  joinParts,
  lineKey,
  pcmReader,
  PART_BYTES,
  SHARED_LINE_KEYS,
  splitParts,
  wavSamples,
} from '../src/coachSpeech.ts'
import { ALL_DONE_SPEECH, replyFailedText, WIRING_FAILED_TEXT } from '../src/coachVoice.ts'
import { voiceNoteText } from '../src/voice.ts'

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

describe('lineKey', () => {
  test('is 32 hex characters, the same for the same words', async () => {
    const key = await lineKey('All steps done.')
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(await lineKey('All steps done.')).toBe(key)
  })

  test('changes with the words', async () => {
    expect(await lineKey('All steps done.')).not.toBe(await lineKey('All steps done!'))
  })
})

describe('shared lines', () => {
  // Every line the same for every skill is shipped with the app; new wording needs a new
  // file, or that line would be streamed every time.
  test('cover "All steps done.", the wiring failure, the reply failures and the voice notes', async () => {
    const texts = [
      ALL_DONE_SPEECH,
      WIRING_FAILED_TEXT,
      replyFailedText('limited'),
      replyFailedText('unanswered'),
      replyFailedText('error'),
      voiceNoteText('dropped'),
      voiceNoteText('left'),
      voiceNoteText('unchecked'),
    ]
    const keys = await Promise.all(texts.map(lineKey))
    expect(keys.filter((k) => !SHARED_LINE_KEYS.has(k))).toEqual([])
    expect(SHARED_LINE_KEYS.size).toBe(texts.length)
  })
})

describe('pcmReader', () => {
  test('reads 16 bit little endian samples', () => {
    const read = pcmReader()
    expect([...read(bytes(0x00, 0x40, 0x00, 0xc0))]).toEqual([0.5, -0.5])
  })

  test('keeps a byte split from its sample until the next chunk', () => {
    const read = pcmReader()
    expect([...read(bytes(0x00, 0x40, 0x00))]).toEqual([0.5])
    expect([...read(bytes(0xc0))]).toEqual([-0.5])
  })
})

describe('splitParts and joinParts', () => {
  test('a line split in parts joins back whole', () => {
    const audio = Uint8Array.from({ length: 10 }, (_, i) => i)
    const parts = splitParts(audio, 4)
    expect(parts.map((p) => p.length)).toEqual([4, 4, 2])
    const saved = parts.map((p, part) => ({ key: 'k', part, parts: parts.length, audio: p })).reverse()
    expect([...joinParts(saved).get('k')!]).toEqual([...audio])
  })

  test('parts stay under a Firestore document', () => {
    expect(PART_BYTES % 2).toBe(0)
    expect(PART_BYTES).toBeLessThan(1024 * 1024 - 10_000)
  })

  test('a line with a part missing is left out', () => {
    const saved = [
      { key: 'whole', part: 0, parts: 1, audio: bytes(1, 2) },
      { key: 'half', part: 0, parts: 2, audio: bytes(1, 2) },
    ]
    expect([...joinParts(saved).keys()]).toEqual(['whole'])
  })

  test('no audio has no parts', () => {
    expect(splitParts(new Uint8Array(0))).toEqual([])
  })
})

describe('wavSamples', () => {
  function wav(samples: Uint8Array, extraChunk = false): Uint8Array {
    const extra = extraChunk ? 12 : 0
    const out = new Uint8Array(44 + extra + samples.length)
    const view = new DataView(out.buffer)
    const write = (at: number, s: string) => [...s].forEach((c, i) => (out[at + i] = c.charCodeAt(0)))
    write(0, 'RIFF')
    view.setUint32(4, 36 + extra + samples.length, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    let at = 36
    if (extraChunk) {
      write(36, 'LIST')
      view.setUint32(40, 4, true)
      at = 48
    }
    write(at, 'data')
    view.setUint32(at + 4, samples.length, true)
    out.set(samples, at + 8)
    return out
  }

  test('finds the samples after the header, past other chunks', () => {
    expect([...wavSamples(wav(bytes(1, 2, 3, 4)))!]).toEqual([1, 2, 3, 4])
    expect([...wavSamples(wav(bytes(5, 6), true))!]).toEqual([5, 6])
  })

  test('is null for anything that is not a WAV file', () => {
    expect(wavSamples(bytes(1, 2, 3))).toBeNull()
    expect(wavSamples(new TextEncoder().encode('<!doctype html><html></html>'))).toBeNull()
  })
})

describe('coachCanSpeak', () => {
  test('online with Web Audio, Achird can speak whatever the device voice', () => {
    for (const deviceVoice of [true, false, undefined]) expect(coachCanSpeak({ online: true, webAudio: true, deviceVoice })).toBe(true)
  })

  test('offline, only a device voice can speak; unknown while the voices load', () => {
    expect(coachCanSpeak({ online: false, webAudio: true, deviceVoice: true })).toBe(true)
    expect(coachCanSpeak({ online: false, webAudio: true, deviceVoice: false })).toBe(false)
    expect(coachCanSpeak({ online: false, webAudio: true, deviceVoice: undefined })).toBeNull()
  })

  test('without Web Audio, the device voice decides even online', () => {
    expect(coachCanSpeak({ online: true, webAudio: false, deviceVoice: false })).toBe(false)
  })
})
