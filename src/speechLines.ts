// The coach's lines in the Achird voice (#100): streamed from Gemini through Firebase AI
// Logic, and kept in Firestore as skills/{id}/steps/{stepId}/speech/{key}-{part} so a
// fixed line is made once. Only the skill's creator saves them (firestore.rules).
import { getGenerativeModel, ResponseModality } from 'firebase/ai'
import { Bytes, collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { joinParts, sharedLineUrl, SPEECH_MODEL, SPEECH_STYLE, SPEECH_VOICE, splitParts, wavSamples, type SavedPart } from './coachSpeech.ts'
import { ai, db } from './firebase.ts'

const speechModel = getGenerativeModel(ai, {
  model: SPEECH_MODEL,
  generationConfig: {
    responseModalities: [ResponseModality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEECH_VOICE } } },
  },
})

function base64Bytes(data: string): Uint8Array {
  const text = atob(data)
  const bytes = new Uint8Array(text.length)
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}

// The line's audio, chunk by chunk as it arrives. signal cancels the request.
export async function* streamLine(text: string, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  const result = await speechModel.generateContentStream([{ type: 'text', text, speechMetadata: { style: SPEECH_STYLE } }], { signal })
  for await (const chunk of result.stream) {
    for (const part of chunk.inlineDataParts() ?? []) {
      if (part.inlineData.data) yield base64Bytes(part.inlineData.data)
    }
  }
}

type SpeechDocument = { key: string; part: number; parts: number; audio: Bytes }

// A step's saved lines by key. Lines with a part missing are left out.
export async function loadStepLines(skillId: string, stepId: string): Promise<Map<string, Uint8Array>> {
  const snapshot = await getDocs(collection(db, 'skills', skillId, 'steps', stepId, 'speech'))
  const parts: SavedPart[] = []
  for (const d of snapshot.docs) {
    const data = d.data() as Partial<SpeechDocument>
    if (typeof data.key !== 'string' || typeof data.part !== 'number' || typeof data.parts !== 'number' || !(data.audio instanceof Bytes)) continue
    parts.push({ key: data.key, part: data.part, parts: data.parts, audio: data.audio.toUint8Array() })
  }
  return joinParts(parts)
}

// Saves a whole line under its step, in one batch, so it is never half saved.
export async function saveStepLine(skillId: string, stepId: string, key: string, text: string, audio: Uint8Array): Promise<void> {
  const parts = splitParts(audio)
  if (parts.length === 0) return
  const batch = writeBatch(db)
  parts.forEach((part, i) => {
    batch.set(doc(db, 'skills', skillId, 'steps', stepId, 'speech', `${key}-${i}`), {
      key,
      part: i,
      parts: parts.length,
      text,
      model: SPEECH_MODEL,
      voice: SPEECH_VOICE,
      audio: Bytes.fromUint8Array(part),
      createdAt: serverTimestamp(),
    })
  })
  await batch.commit()
}

// A line shipped with the app, or null when it cannot be loaded.
export async function loadSharedLine(key: string): Promise<Uint8Array | null> {
  const response = await fetch(sharedLineUrl(key))
  if (!response.ok) return null
  return wavSamples(new Uint8Array(await response.arrayBuffer()))
}
