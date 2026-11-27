// Counts one AI draft for this visitor in Firestore (#113): draftCounts/{visitor id} holds
// today's count and when it was last raised. False when today's drafts are used up.
import { FirebaseError } from 'firebase/app'
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { auth, db, signInLearner } from './firebase'
import { nextDraftCount } from './draftLimit'

export async function countDraft(): Promise<boolean> {
  await signInLearner()
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('No visitor is signed in.')
  const ref = doc(db, 'draftCounts', uid)
  try {
    return await runTransaction(db, async (t) => {
      const snap = await t.get(ref)
      const at = snap.get('at') as Timestamp | undefined
      const next = nextDraftCount(snap.exists() && at ? { count: snap.get('count') as number, atMs: at.toMillis() } : null, Date.now())
      if (next === null) return false
      t.set(ref, { count: next, at: serverTimestamp() })
      return true
    })
  } catch (e) {
    // The rules refuse a sixth draft even when this page's clock disagrees with the server's day.
    if (e instanceof FirebaseError && e.code === 'permission-denied') return false
    throw e
  }
}
