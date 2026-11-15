// The expert dashboard (#20): Google sign in, whether the account is a listed expert,
// the open questions, and replying. The shapes are in the Contracts section of the
// build plan, and firestore.rules checks every field.
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import {
  Bytes,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export const REPLY_MAX_LENGTH = 2000

export type Expert = { userId: string; name: string }

export type ExpertStatus =
  | { state: 'checking' }
  | { state: 'signed-out' }
  | { state: 'not-expert'; userId: string }
  | ({ state: 'expert' } & Expert)

// Only a Google sign in can be an expert (the rules check the same).
function isGoogleUser(user: User | null): user is User {
  return !!user && user.providerData.some((provider) => provider.providerId === GoogleAuthProvider.PROVIDER_ID)
}

// Calls onChange with the signed in account's expert status, now and whenever the
// account or its experts entry changes (Tino adding the account shows at once).
// Returns a function that stops listening.
export function watchExpertStatus(onChange: (status: ExpertStatus) => void, onError: (error: unknown) => void): () => void {
  let stopEntry = () => {}
  const stopAuth = onAuthStateChanged(auth, (user) => {
    stopEntry()
    stopEntry = () => {}
    if (!isGoogleUser(user)) return onChange({ state: 'signed-out' })
    onChange({ state: 'checking' })
    stopEntry = onSnapshot(
      doc(db, 'experts', user.uid),
      (entry) => {
        const name: unknown = entry.data()?.name
        onChange(
          typeof name === 'string' && name.trim()
            ? { state: 'expert', userId: user.uid, name }
            : { state: 'not-expert', userId: user.uid },
        )
      },
      onError,
    )
  })
  return () => {
    stopAuth()
    stopEntry()
  }
}

// Opens Google's sign in popup. Resolves false when the expert closed it.
export async function signInExpert(): Promise<boolean> {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider())
    return true
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return false
    throw e
  }
}

export function signOutExpert(): Promise<void> {
  return signOut(auth)
}

export type OpenQuestion = {
  id: string
  skillId: string
  skillTitle: string
  stepId: string
  stepNumber: number
  stepTitle: string
  stepInstruction: string
  question: string
  frameUrl: string
  judgeSaid: string | null
  createdAt: Date | null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toOpenQuestion(snapshot: DocumentSnapshot): OpenQuestion {
  const data = snapshot.data({ serverTimestamps: 'estimate' }) ?? {}
  const createdAt = data.createdAt as Timestamp | undefined
  return {
    id: snapshot.id,
    skillId: text(data.skillId),
    skillTitle: text(data.skillTitle),
    stepId: text(data.stepId),
    stepNumber: typeof data.stepNumber === 'number' ? data.stepNumber : 0,
    stepTitle: text(data.stepTitle),
    stepInstruction: text(data.stepInstruction),
    question: text(data.question),
    frameUrl: data.frame instanceof Bytes ? `data:image/jpeg;base64,${data.frame.toBase64()}` : '',
    judgeSaid: typeof data.judgeSaid === 'string' ? data.judgeSaid : null,
    createdAt: createdAt && typeof createdAt.toDate === 'function' ? createdAt.toDate() : null,
  }
}

// Calls onChange with every open question, oldest first, now and whenever one changes.
// Equality filter only, so no composite index is needed; sorted here instead.
export function watchOpenQuestions(onChange: (questions: OpenQuestion[]) => void, onError: (error: unknown) => void): () => void {
  return onSnapshot(
    query(collection(db, 'questions'), where('status', '==', 'open')),
    (snapshot) =>
      onChange(
        snapshot.docs
          .map(toOpenQuestion)
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
      ),
    onError,
  )
}

// Returns why the reply cannot be sent, or null when it can.
export function replyProblem(textValue: string): string | null {
  const reply = textValue.trim()
  if (!reply) return 'Type your reply first.'
  if (reply.length > REPLY_MAX_LENGTH) return `Keep your reply under ${REPLY_MAX_LENGTH} characters.`
  return null
}

export class AlreadyAnsweredError extends Error {
  constructor() {
    super('This question was already answered.')
    this.name = 'AlreadyAnsweredError'
  }
}

// Writes the reply onto the question and saves it as an answer under the question's
// skill and step, in one batch: both are saved, or neither.
export async function replyToQuestion(question: OpenQuestion, replyText: string, expert: Expert): Promise<void> {
  const problem = replyProblem(replyText)
  if (problem) throw new Error(problem)
  const answer = replyText.trim()
  const batch = writeBatch(db)
  batch.update(doc(db, 'questions', question.id), {
    status: 'answered',
    reply: { text: answer, expertId: expert.userId, expertName: expert.name, answeredAt: serverTimestamp() },
  })
  batch.set(doc(db, 'skills', question.skillId, 'steps', question.stepId, 'answers', question.id), {
    questionId: question.id,
    question: question.question,
    answer,
    expertId: expert.userId,
    expertName: expert.name,
    createdAt: serverTimestamp(),
  })
  try {
    await batch.commit()
  } catch (e) {
    // The rules refuse a reply to a question that is no longer open.
    const latest = await getDoc(doc(db, 'questions', question.id)).catch(() => null)
    if (latest?.data()?.status === 'answered') throw new AlreadyAnsweredError()
    throw e
  }
}
