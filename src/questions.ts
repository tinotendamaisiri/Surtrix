// Ask an Expert (#17): saving a learner's question and listing their questions for a
// step. The document shape is in the Contracts section of the build plan, and
// firestore.rules checks every field.
import {
  addDoc,
  Bytes,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'

export const QUESTION_MAX_LENGTH = 500

// A frame this size keeps the question under Firestore's 1 MiB document limit.
export const FRAME_MAX_BYTES = 900 * 1024

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
}

export type Question = {
  id: string
  question: string
  frameUrl: string
  origin: QuestionOrigin
  judgeSaid: string | null
  status: 'open' | 'answered'
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

// Saves the question for an expert. Resolves once Firestore has accepted it.
export async function askExpert({ step, question, frameBase64, judgeSaid }: NewQuestion): Promise<void> {
  const problem = questionProblem(question)
  if (problem) throw new Error(problem)
  const frame = Bytes.fromBase64String(frameBase64)
  if (frame.toUint8Array().byteLength >= FRAME_MAX_BYTES) throw new FrameTooLargeError()
  await signInLearner()
  const learnerId = auth.currentUser?.uid
  if (!learnerId) throw new Error('The learner is not signed in.')
  await addDoc(collection(db, 'questions'), {
    learnerId,
    skillId: step.skillId,
    skillTitle: step.skillTitle,
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    stepTitle: step.stepTitle,
    stepInstruction: step.stepInstruction,
    question: question.trim(),
    frame,
    origin: judgeSaid === null ? 'learner' : 'judge',
    judgeSaid,
    status: 'open',
    createdAt: serverTimestamp(),
  })
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
  }
}

function toQuestion(snapshot: DocumentSnapshot): Question {
  // Until the server sets createdAt, use the local estimate so a new question sorts first.
  const data = snapshot.data({ serverTimestamps: 'estimate' }) ?? {}
  const reply = toReply(data.reply)
  return {
    id: snapshot.id,
    question: String(data.question ?? ''),
    frameUrl: data.frame instanceof Bytes ? `data:image/jpeg;base64,${data.frame.toBase64()}` : '',
    origin: data.origin === 'judge' ? 'judge' : 'learner',
    judgeSaid: typeof data.judgeSaid === 'string' ? data.judgeSaid : null,
    status: data.status === 'answered' || reply ? 'answered' : 'open',
    createdAt: toDate(data.createdAt),
    reply,
  }
}

// A question with no time yet is the newest.
function sortTime(question: Question): number {
  return question.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER
}

// Calls onChange with this learner's questions for the step, newest first, now and
// whenever one changes. Returns a function that stops listening.
export function watchMyQuestions(
  step: Pick<QuestionStep, 'skillId' | 'stepId'>,
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
      where('skillId', '==', step.skillId),
      where('stepId', '==', step.stepId),
    )
    stopListening = onSnapshot(
      mine,
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
