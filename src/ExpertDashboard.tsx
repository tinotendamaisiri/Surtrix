// The expert dashboard at #expert (#20, redesigned in #105 to the approved design): an
// expert signs in with Google, sees their skills (published and drafts) with stats, and
// answers the open questions, with an optional photo. Since #52 the expert also makes
// skills (on the Create a skill screen) and publishes or unpublishes their own.
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { listSkillsBy, setSkillPublished, type SkillSummary } from './skills'
import {
  AlreadyAnsweredError,
  answeredBy,
  REPLY_MAX_LENGTH,
  REPLY_PHOTO_MAX_BYTES,
  replyProblem,
  replyToQuestion,
  signInExpert,
  signOutExpert,
  watchExpertStatus,
  watchOpenQuestions,
  type Expert,
  type ExpertStatus,
  type OpenQuestion,
} from './experts'
import { learnersHelped, skillsInTab, stepsLine, tabCounts, timeAgo, tradeLine, type SkillsTab } from './expertDashboard.ts'
import { shrinkPhoto } from './photo.ts'
import { BADGES, CARD_BADGES, type BadgeId } from './safety.ts'
import SafetyBadges from './SafetyBadges.tsx'
import { coachHash, SKILLS_HASH } from './screenAddress.ts'
import Wordmark from './Wordmark.tsx'
import './ExpertDashboard.css'

const NEW_SKILL_HASH = '#new-skill'
const QUESTIONS_ID = 'xd-questions'

export default function ExpertDashboard() {
  const [status, setStatus] = useState<ExpertStatus>({ state: 'checking' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(
    () =>
      watchExpertStatus(setStatus, (e) => {
        console.error('Could not check the expert account', e)
        setError('Could not check your account. Reload the page to try again.')
      }),
    [],
  )

  async function signIn() {
    setBusy(true)
    setError(null)
    try {
      await signInExpert()
    } catch (e) {
      console.error('Google sign in failed', e)
      setError('Could not sign in with Google. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    setError(null)
    await signOutExpert().catch((e) => {
      console.error('Sign out failed', e)
      setError('Could not sign out. Please try again.')
    })
  }

  if (status.state === 'expert') {
    return <ExpertHome expert={{ userId: status.userId, name: status.name }} onSignOut={signOut} error={error} />
  }

  return (
    <div className="xd">
      <header className="xd-header">
        <HeaderBrand />
        <nav className="xd-nav" aria-label="Pages">
          <a className="xd-navpill" href={SKILLS_HASH}>
            Skills library
          </a>
        </nav>
      </header>
      <main className="xd-wrap">
        <section className="xd-panel xd-account">
          <p className="xd-lbl">EXPERT DASHBOARD</p>
          {status.state === 'checking' && <p className="xd-muted">Checking your account</p>}
          {status.state === 'signed-out' && (
            <>
              <h1>For Surtrix experts</h1>
              <p>Sign in with the Google account the Surtrix team added.</p>
              <button type="button" className="xd-btn xd-primary" onClick={signIn} disabled={busy}>
                Sign in with Google
              </button>
              <p className="xd-muted">
                Signing in here replaces the learner on this browser, and with it their skills and questions. To learn and
                answer on one computer, use a separate browser profile for each.
              </p>
            </>
          )}
          {status.state === 'not-expert' && (
            <>
              <h1>Not a Surtrix expert yet</h1>
              <p>
                Your user id is <code>{status.userId}</code>. Send it to the Surtrix team to be added.
              </p>
              <button type="button" className="xd-btn" onClick={signOut}>
                Sign out
              </button>
            </>
          )}
          {error && <p className="xd-error">{error}</p>}
        </section>
      </main>
    </div>
  )
}

function HeaderBrand() {
  return (
    <div className="xd-brand">
      <a href="#" aria-label="Surtrix home">
        <Wordmark white />
      </a>
      <span className="xd-lbl xd-brand-label">EXPERT</span>
    </div>
  )
}

// The signed in expert's dashboard: header, welcome with stats, their skills, the open
// questions and the badge key.
function ExpertHome({ expert, onSignOut, error }: { expert: Expert; onSignOut: () => void; error: string | null }) {
  const [skills, setSkills] = useState<SkillSummary[] | null>(null)
  const [skillsFailed, setSkillsFailed] = useState(false)
  const [questions, setQuestions] = useState<OpenQuestion[] | null>(null)
  const [questionsFailed, setQuestionsFailed] = useState(false)
  const [helped, setHelped] = useState<number | null>(null)
  const [answeredCount, setAnsweredCount] = useState(0)

  useEffect(() => {
    let onScreen = true
    listSkillsBy(expert.userId).then(
      (mine) => onScreen && setSkills(mine),
      (e) => {
        console.error('Could not list your skills', e)
        if (onScreen) setSkillsFailed(true)
      },
    )
    return () => {
      onScreen = false
    }
  }, [expert.userId])

  useEffect(
    () =>
      watchOpenQuestions(
        (open) => {
          setQuestions(open)
          setQuestionsFailed(false)
        },
        (e) => {
          console.error('Could not list open questions', e)
          setQuestionsFailed(true)
        },
      ),
    [],
  )

  // Learners helped is read again after each answer this expert sends.
  useEffect(() => {
    let onScreen = true
    answeredBy(expert.userId).then(
      (answered) => onScreen && setHelped(learnersHelped(answered)),
      (e) => console.error('Could not count the learners helped', e),
    )
    return () => {
      onScreen = false
    }
  }, [expert.userId, answeredCount])

  const counts = tabCounts(skills ?? [])
  const openCount = questions?.length ?? 0

  return (
    <div className="xd">
      <header className="xd-header">
        <HeaderBrand />
        <nav className="xd-nav" aria-label="Pages">
          <a className="xd-navpill xd-on" href="#expert" aria-current="page">
            My skills
          </a>
          <button type="button" className="xd-navpill" onClick={() => document.getElementById(QUESTIONS_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            Questions
            {openCount > 0 && <span className="xd-count">{openCount}</span>}
          </button>
          <a className="xd-navpill" href={SKILLS_HASH}>
            Skills library
          </a>
        </nav>
        <div className="xd-header-actions">
          <a className="xd-btn xd-primary" href={NEW_SKILL_HASH}>
            + Create a skill
          </a>
          <span className="xd-who">
            {expert.name} <span className="xd-vb" aria-label="verified expert">✓</span>
            <button type="button" className="xd-btn xd-small" onClick={onSignOut}>
              Sign out
            </button>
          </span>
        </div>
      </header>

      <main className="xd-wrap">
        <section className="xd-hero">
          <div>
            <p className="xd-lbl">EXPERT DASHBOARD</p>
            <h1>Welcome back, {expert.name}.</h1>
            <p className="xd-muted xd-sub">Your skills, and the learners who need you right now.</p>
          </div>
          <dl className="xd-panel xd-stats">
            <Stat value={skills ? counts.published : null} label="Published skills" />
            <Stat value={skills ? counts.drafts : null} label={counts.drafts === 1 ? 'Draft' : 'Drafts'} />
            <Stat value={helped} label="Learners helped" />
            <Stat value={questions ? openCount : null} label="Open questions" gold />
          </dl>
        </section>
        {error && <p className="xd-error">{error}</p>}

        <div className="xd-columns">
          <YourSkills skills={skills} failed={skillsFailed} expert={expert} onChange={setSkills} />
          <aside className="xd-side">
            <OpenQuestions
              questions={questions}
              failed={questionsFailed}
              expert={expert}
              onAnswered={() => setAnsweredCount((n) => n + 1)}
            />
            <BadgeKey />
          </aside>
        </div>
      </main>
    </div>
  )
}

function Stat({ value, label, gold = false }: { value: number | null; label: string; gold?: boolean }) {
  return (
    <div className="xd-stat">
      <dt>{label}</dt>
      <dd className={gold ? 'xd-gold' : undefined}>{value ?? '·'}</dd>
    </div>
  )
}

const TABS: { tab: SkillsTab; label: string }[] = [
  { tab: 'all', label: 'All' },
  { tab: 'published', label: 'Published' },
  { tab: 'drafts', label: 'Drafts' },
]

// Your skills (#52, #105): All, Published and Drafts, each skill a card with Publish or
// Unpublish, and a last card to create a skill.
function YourSkills({
  skills,
  failed,
  expert,
  onChange,
}: {
  skills: SkillSummary[] | null
  failed: boolean
  expert: Expert
  onChange: (update: (current: SkillSummary[] | null) => SkillSummary[] | null) => void
}) {
  const [tab, setTab] = useState<SkillsTab>('all')
  const [changing, setChanging] = useState<string | null>(null)
  const [error, setError] = useState<{ skillId: string; text: string } | null>(null)
  const counts = tabCounts(skills ?? [])

  async function change(skill: SkillSummary) {
    const published = !skill.published
    setChanging(skill.id)
    setError(null)
    try {
      await setSkillPublished(skill.id, published, expert.name)
      onChange((current) => current?.map((s) => (s.id === skill.id ? { ...s, published } : s)) ?? current)
    } catch (e) {
      console.error('Could not change whether the skill is published', e)
      setError({
        skillId: skill.id,
        text: published ? 'Could not publish this skill. Please try again.' : 'Could not unpublish this skill. Please try again.',
      })
    } finally {
      setChanging(null)
    }
  }

  return (
    <section className="xd-skills" aria-labelledby="xd-skills-heading">
      <div className="xd-skills-head">
        <h2 id="xd-skills-heading">Your skills</h2>
        <div className="xd-tabs" role="group" aria-label="Show">
          {TABS.map(({ tab: t, label }) => (
            <button key={t} type="button" className={`xd-tab${tab === t ? ' xd-on' : ''}`} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {label} {skills ? counts[t] : ''}
            </button>
          ))}
        </div>
      </div>
      {failed && <p className="xd-error">Could not load your skills. Reload the page to try again.</p>}
      {!failed && skills === null && <p className="xd-muted">Loading your skills</p>}
      {skills && (
        <ul className="xd-grid">
          {skillsInTab(skills, tab).map((skill) => (
            <li key={skill.id} className="xd-card">
              <a className="xd-cover" href={coachHash(skill.id)} aria-label={`Open ${skill.title}`}>
                <img src="/brand/surtrix-mark-white-512.webp" alt="" width={56} height={56} />
                <span className={`xd-status ${skill.published ? 'xd-pub' : 'xd-draft'}`}>{skill.published ? 'PUBLISHED' : 'DRAFT'}</span>
              </a>
              <div className="xd-cbody">
                {tradeLine(skill.trade, skill.level) && <p className="xd-meta">{tradeLine(skill.trade, skill.level)}</p>}
                <h3>{skill.title}</h3>
                {skill.description && <p className="xd-desc">{skill.description}</p>}
                <SafetyBadges badges={skill.badges} max={CARD_BADGES} className="xd-card-badges" />
                <p className="xd-row">
                  <span>{stepsLine(skill.stepCount, skill.minutes)}</span>
                  {!skill.published && <span>Not published</span>}
                </p>
                <div className="xd-btns">
                  <button
                    type="button"
                    className={`xd-btn${skill.published ? '' : ' xd-primary'}`}
                    onClick={() => change(skill)}
                    disabled={changing !== null}
                  >
                    {changing === skill.id ? 'Saving' : skill.published ? 'Unpublish' : 'Publish'}
                  </button>
                </div>
                {error?.skillId === skill.id && <p className="xd-error">{error.text}</p>}
              </div>
            </li>
          ))}
          <li className="xd-card xd-create">
            <a href={NEW_SKILL_HASH}>
              <span className="xd-plus" aria-hidden="true">
                +
              </span>
              Create a skill
              <span className="xd-muted">Add a manual, photos, a video, a YouTube link or a voice note. AI drafts the steps.</span>
            </a>
          </li>
        </ul>
      )}
    </section>
  )
}

// Open questions: every open question, oldest first, each answered with text and an
// optional photo.
function OpenQuestions({
  questions,
  failed,
  expert,
  onAnswered,
}: {
  questions: OpenQuestion[] | null
  failed: boolean
  expert: Expert
  onAnswered: () => void
}) {
  // Cards with a reply typed or sending stay on screen when their question stops being
  // open: Firestore drops it from the list as soon as Send is pressed, and another
  // expert may answer first. The card then shows what happened.
  const [held, setHeld] = useState<Record<string, OpenQuestion>>({})
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  function hold(question: OpenQuestion, keep: boolean) {
    setHeld((current) => {
      if (keep === question.id in current) return current
      const next = { ...current }
      if (keep) next[question.id] = question
      else delete next[question.id]
      return next
    })
  }

  const openIds = new Set((questions ?? []).map((question) => question.id))
  const shown = [...(questions ?? []), ...Object.values(held).filter((question) => !openIds.has(question.id))].sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  )

  return (
    <section id={QUESTIONS_ID} className="xd-panel xd-questions" aria-labelledby="xd-questions-heading">
      <div className="xd-questions-head">
        <h2 id="xd-questions-heading">Open questions</h2>
        <span className="xd-live">
          <i aria-hidden="true" /> LIVE
        </span>
      </div>
      <p className="xd-muted xd-small-text">Learners see your answer straight away. It is saved to the skill, so the next learner gets it even offline.</p>
      {failed && <p className="xd-error">Could not load the questions. Reload the page to try again.</p>}
      {!failed && questions === null && <p className="xd-muted">Loading questions</p>}
      {!failed && questions !== null && shown.length === 0 && <p className="xd-muted">No open questions.</p>}
      <ul className="xd-qlist">
        {shown.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            expert={expert}
            now={now}
            stillOpen={openIds.has(question.id)}
            hold={(keep) => hold(question, keep)}
            onAnswered={onAnswered}
          />
        ))}
      </ul>
    </section>
  )
}

type CardProps = {
  question: OpenQuestion
  expert: Expert
  now: Date
  // False once the question is no longer in the open list.
  stillOpen: boolean
  // Keeps the card on screen (true) or lets it go (false).
  hold: (keep: boolean) => void
  onAnswered: () => void
}

function QuestionCard({ question, expert, now, stillOpen, hold, onAnswered }: CardProps) {
  const [open, setOpen] = useState(false)
  const [reply, setReply] = useState('')
  const [photo, setPhoto] = useState<{ bytes: Uint8Array; url: string } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Answered by someone else while this card was held (not by this card's own send).
  const answeredElsewhere = !stillOpen && !sending && error === null

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url)
    },
    [photo],
  )

  function changeReply(value: string) {
    setReply(value)
    hold(value.trim() !== '' || photo !== null)
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPreparing(true)
    setError(null)
    try {
      const bytes = await shrinkPhoto(file, REPLY_PHOTO_MAX_BYTES)
      setPhoto({ bytes, url: URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) })
      hold(true)
    } catch (e) {
      console.error('Could not use the photo', e)
      setError('Could not use this photo. Try another one.')
    } finally {
      setPreparing(false)
    }
  }

  async function send() {
    if (replyProblem(reply)) return
    hold(true)
    setSending(true)
    setError(null)
    try {
      await replyToQuestion(question, reply, expert, photo?.bytes)
      onAnswered()
      // Answered: the question has left the open list, so the card goes too.
      hold(false)
    } catch (e) {
      console.error('Could not send the reply', e)
      setError(
        e instanceof AlreadyAnsweredError
          ? 'This question was already answered. Your reply was not sent.'
          : 'Could not send your reply. Please try again.',
      )
      setSending(false)
    }
  }

  return (
    <li className="xd-q">
      {question.frameUrl ? (
        <img className="xd-thumb" src={question.frameUrl} alt="The learner's bench photo" />
      ) : (
        <span className="xd-thumb" aria-hidden="true" />
      )}
      <div className="xd-q-body">
        <p className="xd-lbl xd-q-label">
          {question.origin === 'judge' ? 'AUTO ASKED BY AI' : 'ASKED BY LEARNER'}
          {question.createdAt && ` · ${timeAgo(question.createdAt, now)}`}
        </p>
        <p className="xd-q-step">
          {question.skillTitle} · Step {question.stepNumber}
        </p>
        <p className="xd-q-text">“{question.question}”</p>
        {question.judgeSaid !== null && <p className="xd-muted xd-small-text">The check was not sure: {question.judgeSaid}</p>}
        {!open && stillOpen && (
          <button type="button" className="xd-btn xd-primary" onClick={() => setOpen(true)}>
            Answer with photo
          </button>
        )}
        {(open || !stillOpen) && (
          <div className="xd-answer">
            <p className="xd-muted xd-small-text">
              Step {question.stepNumber}: {question.stepTitle}. {question.stepInstruction}
            </p>
            <label className="xd-field-label">
              Your answer
              <textarea
                className="xd-field"
                rows={3}
                maxLength={REPLY_MAX_LENGTH}
                value={reply}
                onChange={(e) => changeReply(e.target.value)}
                disabled={sending}
              />
            </label>
            <input ref={fileRef} type="file" accept="image/*" className="xd-hidden" onChange={pickPhoto} tabIndex={-1} aria-hidden="true" />
            {photo ? (
              <div className="xd-photo">
                <img src={photo.url} alt="Your photo for this answer" />
                <button
                  type="button"
                  className="xd-x"
                  aria-label="Remove the photo"
                  onClick={() => {
                    setPhoto(null)
                    hold(reply.trim() !== '')
                  }}
                  disabled={sending}
                >
                  ✕
                </button>
              </div>
            ) : (
              <button type="button" className="xd-btn xd-gold" onClick={() => fileRef.current?.click()} disabled={sending || preparing}>
                {preparing ? 'Getting the photo ready' : 'Add a photo'}
              </button>
            )}
            {answeredElsewhere && <p className="xd-error">This question was already answered. Your reply was not sent.</p>}
            <div className="xd-btns">
              <button type="button" className="xd-btn xd-primary" onClick={send} disabled={sending || preparing || !stillOpen || replyProblem(reply) !== null}>
                {sending ? 'Sending' : 'Send answer'}
              </button>
              {!stillOpen && !sending ? (
                <button type="button" className="xd-btn" onClick={() => hold(false)}>
                  Remove
                </button>
              ) : (
                <button type="button" className="xd-btn" onClick={() => setOpen(false)} disabled={sending}>
                  Close
                </button>
              )}
            </div>
            {error && <p className="xd-error">{error}</p>}
          </div>
        )}
      </div>
    </li>
  )
}

// The safety badge key (#104, #105): every badge, blue to wear, yellow to watch out for.
function BadgeKey() {
  return (
    <section className="xd-panel xd-key" aria-labelledby="xd-key-heading">
      <h2 id="xd-key-heading" className="xd-lbl">
        SAFETY BADGES
      </h2>
      <p className="xd-muted xd-small-text">Blue means wear it. Yellow means watch out. They show on every skill card and before the step that needs them.</p>
      <SafetyBadges badges={Object.keys(BADGES) as BadgeId[]} />
    </section>
  )
}
