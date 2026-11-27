// Ask an Expert (#17): saving a learner's question and listing their questions for a
// step. The document shape is in the Contracts section of the build plan, and
// firestore.rules checks every field.
import {
  Bytes,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'

export const QUESTION_MAX_LENGTH = 500

// A frame this size keeps the question under Firestore's 1 MiB document limit.
export const FRAME_MAX_BYTES = 900 * 1024

// The longest copies of the skill and step that firestore.rules accepts. Skills have no
// length limit, so longer text is cut: the copy is only there to show the expert.
const TITLE_MAX_LENGTH = 200
const INSTRUCTION_MAX_LENGTH = 5000
const JUDGE_SAID_MAX_LENGTH = 2000

// The step a question is about. It is copied into the question, so an expert can
// answer without reading the skill.
export type QuestionStep = {
  skillId: string
  skillTitle: string
  stepId: string
  stepNumber: number
  stepTitle: string
  stepInstruction: string
}

export type QuestionOrigin = 'learner' | 'judge'

export type Reply = {
  text: string
  expertName: string
  answeredAt: Date | null
  // The expert's photo (#105), as a data URL, when they answered with one.
  photoUrl?: string
}

export type Question = {
  id: string
  stepId: string
  question: string
  frameUrl: string
  origin: QuestionOrigin
  judgeSaid: string | null
  status: 'open' | 'answered'
  // False until the server has the question, for example while offline.
  sent: boolean
  createdAt: Date | null
  reply: Reply | null
}

// Returns why the question cannot be sent, or null when it can.
export function questionProblem(text: string): string | null {
  const question = text.trim()
  if (!question) return 'Type your question first.'
  if (question.length > QUESTION_MAX_LENGTH) return `Keep your question under ${QUESTION_MAX_LENGTH} characters.`
  return null
}

export class FrameTooLargeError extends Error {
  constructor() {
    super('The photo is too large to send.')
    this.name = 'FrameTooLargeError'
  }
}

export type NewQuestion = {
  step: QuestionStep
  question: string
  // The camera frame as a base64 JPEG.
  frameBase64: string
  // The judge's words, when the judge was unsure and offered Ask an Expert.
  judgeSaid: string | null
}

// Trimmed and at most max characters, as the rules require.
function clip(text: string, max: number): string {
  return text.trim().slice(0, max).trim()
}

// Saves the question for an expert. Resolves as soon as the question is saved in the
// page (it then shows in the learner's list), with its id; saved resolves once the server
// has it, which waits for the network when offline.
export async function askExpert({
  step,
  question,
  frameBase64,
  judgeSaid,
}: NewQuestion): Promise<{ id: string; saved: Promise<void> }> {
  const problem = questionProblem(question)
  if (problem) throw new Error(problem)
  // Model answers often end with a newline; empty words mean the learner asked.
  const judgeWords = judgeSaid === null ? '' : clip(judgeSaid, JUDGE_SAID_MAX_LENGTH)
  const frame = Bytes.fromBase64String(frameBase64)
  if (frame.toUint8Array().byteLength >= FRAME_MAX_BYTES) throw new FrameTooLargeError()
  await signInLearner()
  const learnerId = auth.currentUser?.uid
  if (!learnerId) throw new Error('The learner is not signed in.')
  const ref = doc(collection(db, 'questions'))
  const saved = setDoc(ref, {
    learnerId,
    skillId: step.skillId,
    skillTitle: clip(step.skillTitle, TITLE_MAX_LENGTH),
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    stepTitle: clip(step.stepTitle, TITLE_MAX_LENGTH),
    stepInstruction: clip(step.stepInstruction, INSTRUCTION_MAX_LENGTH),
    question: question.trim(),
    frame,
    origin: judgeWords ? 'judge' : 'learner',
    judgeSaid: judgeWords || null,
    status: 'open',
    createdAt: serverTimestamp(),
  }).then(() => undefined)
  return { id: ref.id, saved }
}

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === 'function' ? (value as Timestamp).toDate() : null
}

// The reply is written by an expert (plan issue 9), so it is read with care.
function toReply(value: unknown): Reply | null {
  if (!value || typeof value !== 'object') return null
  const reply = value as Record<string, unknown>
  if (typeof reply.text !== 'string') return null
  return {
    text: reply.text,
    expertName: typeof reply.expertName === 'string' ? reply.expertName : '',
    answeredAt: toDate(reply.answeredAt),
    ...(reply.photo instanceof Bytes ? { photoUrl: `data:image/jpeg;base64,${reply.photo.toBase64()}` } : {}),
  }
}

function toQuestion(snapshot: DocumentSnapshot): Question {
  // Until the server sets createdAt, use the local estimate so a new question sorts first.
  const data = snapshot.data({ serverTimestamps: 'estimate' }) ?? {}
  const reply = toReply(data.reply)
  return {
    id: snapshot.id,
    stepId: String(data.stepId ?? ''),
    question: String(data.question ?? ''),
    frameUrl: data.frame instanceof Bytes ? `data:image/jpeg;base64,${data.frame.toBase64()}` : '',
    origin: data.origin === 'judge' ? 'judge' : 'learner',
    judgeSaid: typeof data.judgeSaid === 'string' ? data.judgeSaid : null,
    status: data.status === 'answered' || reply ? 'answered' : 'open',
    sent: !snapshot.metadata.hasPendingWrites,
    createdAt: toDate(data.createdAt),
    reply,
  }
}

// A question with no time yet is the newest.
function sortTime(question: Question): number {
  return question.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER
}

// Calls onChange with this learner's questions on the skill, every step, newest first, now
// and whenever one changes (#74). Returns a function that stops listening.
export function watchMyQuestions(
  skillId: string,
  onChange: (questions: Question[]) => void,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false
  let stopListening = () => {}
  signInLearner().then(() => {
    const learnerId = auth.currentUser?.uid
    if (stopped) return
    if (!learnerId) return onError(new Error('The learner is not signed in.'))
    // Equality filters only, so no composite index is needed; sorted here instead.
    const mine = query(
      collection(db, 'questions'),
      where('learnerId', '==', learnerId),
      where('skillId', '==', skillId),
    )
    // Metadata changes too, so a question sent while offline shows as sent once it is.
    stopListening = onSnapshot(
      mine,
      { includeMetadataChanges: true },
      (snapshot) =>
        onChange(
          snapshot.docs
            .map(toQuestion)
            .sort((a, b) => sortTime(b) - sortTime(a)),
        ),
      onError,
    )
  }, onError)
  return () => {
    stopped = true
    stopListening()
  }
}
