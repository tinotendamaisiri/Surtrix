import { describe, expect, test } from 'vitest'
import { checkMadeLines, demoLines, demoLineWrites, type MadeLine } from '../scripts/demoLines.ts'
import { lineKey, PART_BYTES, SPEECH_MODEL, SPEECH_VOICE } from '../src/coachSpeech.ts'
import { stepSpeech } from '../src/coachVoice.ts'
import { demoSkill } from '../src/demoSkill.ts'

async function made(lines = demoLines(), audio = 'AAAA'): Promise<MadeLine[]> {
  return Promise.all(lines.map(async (l) => ({ ...l, key: await lineKey(l.text), audio })))
}

describe('demoLines', () => {
  test("per step: the instruction, the can't see warning, and one confirmation per choice of parts", () => {
    const lines = demoLines()
    // Parts per demo step: 2, 1, 1, 2, so 3 + 1 + 1 + 3 confirmations.
    expect(lines).toHaveLength(16)
    expect(lines[0]).toEqual({ stepId: 'step-1', text: stepSpeech(1, 4, demoSkill.steps[0].title, demoSkill.steps[0].instruction) })
    expect(lines.filter((l) => l.stepId === 'step-1').map((l) => l.text).slice(1)).toEqual([
      "I can't see the breadboard or the LED yet. Point the camera at your bench.",
      'I can see the breadboard now.',
      'I can see the LED now.',
      'I can see the breadboard and the LED now.',
    ])
  })
})

describe('checkMadeLines', () => {
  test('accepts every demo line made with the app model and voice', async () => {
    await expect(checkMadeLines({ model: SPEECH_MODEL, voice: SPEECH_VOICE, lines: await made() })).resolves.toBeUndefined()
  })

  test('refuses another model or voice, a wrong key, a missing line, or no audio', async () => {
    const lines = await made()
    await expect(checkMadeLines({ model: 'other', voice: SPEECH_VOICE, lines })).rejects.toThrow()
    await expect(checkMadeLines({ model: SPEECH_MODEL, voice: 'Puck', lines })).rejects.toThrow()
    await expect(checkMadeLines({ model: SPEECH_MODEL, voice: SPEECH_VOICE, lines: [{ ...lines[0], key: lines[1].key }, ...lines.slice(1)] })).rejects.toThrow('does not match')
    await expect(checkMadeLines({ model: SPEECH_MODEL, voice: SPEECH_VOICE, lines: lines.slice(1) })).rejects.toThrow('Missing')
    await expect(checkMadeLines({ model: SPEECH_MODEL, voice: SPEECH_VOICE, lines: [{ ...lines[0], audio: '' }, ...lines.slice(1)] })).rejects.toThrow('no audio')
  })
})

describe('demoLineWrites', () => {
  test('saves each line as {key}-{part} under its step, in the app shape, at server time', async () => {
    const [line] = await made(demoLines().slice(0, 1), btoa('ab'))
    const [write] = demoLineWrites('p', [line])
    expect(write.update.name).toBe(`projects/p/databases/(default)/documents/skills/sample-led/steps/step-1/speech/${line.key}-0`)
    expect(write.update.fields).toEqual({
      key: { stringValue: line.key },
      part: { integerValue: '0' },
      parts: { integerValue: '1' },
      text: { stringValue: line.text },
      model: { stringValue: SPEECH_MODEL },
      voice: { stringValue: SPEECH_VOICE },
      audio: { bytesValue: btoa('ab') },
    })
    expect(write.updateTransforms).toEqual([{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }])
  })

  test('splits a long line into parts that each fit a document', async () => {
    const long = new Uint8Array(PART_BYTES + 10)
    let text = ''
    for (let i = 0; i < long.length; i += 0x8000) text += String.fromCharCode(...long.subarray(i, i + 0x8000))
    const [line] = await made(demoLines().slice(0, 1), btoa(text))
    const writes = demoLineWrites('p', [line])
    expect(writes.map((w) => [w.update.name.split('-').at(-1), w.update.fields.parts.integerValue, atob(w.update.fields.audio.bytesValue).length])).toEqual([
      ['0', '2', PART_BYTES],
      ['1', '2', 10],
    ])
  })
})
