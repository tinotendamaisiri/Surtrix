// The browser half of remaking the demo skill's coach lines (#100), opened from npm run dev
// at /scripts/demo-lines.html. Each line is made with the app's own request
// (src/speechLines.ts, through Firebase AI Logic with the App Check debug token) and the
// whole set is saved as demo-lines.json for scripts/uploadDemoLines.ts.
import { lineKey, SPEECH_MODEL, SPEECH_VOICE } from '../src/coachSpeech.ts'
import { streamLine } from '../src/speechLines.ts'
import { demoLines, type MadeLine, type MadeLines } from './demoLines.ts'

// The speech model allows about 10 requests a minute for the project (seen Nov 26).
const GAP_MS = 7000

const log = document.getElementById('log')!
const button = document.getElementById('make') as HTMLButtonElement

function show(line: string) {
  log.textContent += `${line}\n`
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

async function makeLine(text: string): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of streamLine(text, new AbortController().signal)) chunks.push(chunk)
  const audio = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    audio.set(c, at)
    at += c.length
  }
  return audio
}

button.addEventListener('click', async () => {
  button.disabled = true
  const lines = demoLines()
  const made: MadeLine[] = []
  for (const [i, line] of lines.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, GAP_MS))
    try {
      const audio = await makeLine(line.text)
      made.push({ ...line, key: await lineKey(line.text), audio: base64(audio) })
      show(`${i + 1}/${lines.length} ${line.stepId} ${(audio.length / 48000).toFixed(1)} s  ${line.text}`)
    } catch (e) {
      show(`${i + 1}/${lines.length} ${line.stepId} FAILED (${e instanceof Error ? e.message : String(e)})  ${line.text}`)
    }
  }
  if (made.length < lines.length) {
    show('Some lines failed; nothing saved. Wait a minute and make them again.')
    button.disabled = false
    return
  }
  const file: MadeLines = { model: SPEECH_MODEL, voice: SPEECH_VOICE, lines: made }
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
  link.download = 'demo-lines.json'
  link.click()
  show('Saved demo-lines.json.')
})
