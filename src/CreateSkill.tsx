// Create a skill (#106), to the approved design: 1 About the skill, 2 Add anything you have
// (notes and one Attach menu: document, photos, video, YouTube link, record or upload audio),
// the AI draft through Firebase AI Logic, and 3 Check the AI draft (safety badges, tools
// with a photo and an alternative, parts, steps), then Save or Publish. Opened at
// #new-skill, and at #edit-skill/{id} to edit one of your own skills.
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { demoProcedureText } from './demoSkill'
import { watchExpertStatus, type ExpertStatus } from './experts'
import { shrinkPhoto } from './photo.ts'
import { BADGES, knownBadges, type BadgeId } from './safety.ts'
import SafetyBadges, { BadgeIcon } from './SafetyBadges.tsx'
import { coachHash, MY_SKILLS_HASH, SKILLS_HASH } from './screenAddress.ts'
import { LEVELS, type Skill, type Step } from './skill.ts'
import {
  ATTACH_LIMITS,
  attachProblem,
  cleanSkill,
  DOCUMENT_ACCEPT,
  DOCUMENT_TYPES,
  DRAFT_MODEL,
  draftedFrom,
  skillProblem,
  youTubeLink,
  type Attachment,
  type AttachmentKind,
} from './skillDraft.ts'
import { draftSkill } from './skillDraftCall.ts'
import { loadSkillForEdit, saveSkill, setSkillPublished, updateSkill } from './skills'
import Wordmark from './Wordmark.tsx'
import './ExpertDashboard.css'
import './CreateSkill.css'

// Photos sent with the draft are shrunk first; a tool's saved photo is smaller still.
const DRAFT_PHOTO_BYTES = 400_000
const TOOL_PHOTO_BYTES = 150_000
const FIRST_TRADES = ['Electronics', 'Soldering', 'Auto mechanics', 'Plumbing', 'Electrical']

type EditorStep = Step & { badges: string[]; editing?: boolean }
type ToolPhoto = { url: string; blob?: Blob; bytes?: Uint8Array }
type EditorTool = { name: string; alternative: string; photo: ToolPhoto | null }

let nextId = 0
const newId = () => `a${++nextId}`

function readBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function sizeText(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function clockText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

// A document's type: what the browser says, or the file name's ending.
function documentType(file: File): string {
  if (file.type) return file.type
  const ending = file.name.split('.').pop()?.toLowerCase()
  const byEnding: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return byEnding[ending ?? ''] ?? ''
}

export default function CreateSkill({ skillId }: { skillId?: string }) {
  const [status, setStatus] = useState<ExpertStatus>({ state: 'checking' })
  const expert = status.state === 'expert' ? status : null
  useEffect(() => watchExpertStatus(setStatus, (e) => console.error('Could not check the expert account', e)), [])

  // 1 About the skill
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [trade, setTrade] = useState('')
  const [newTrade, setNewTrade] = useState<string | null>(null)
  const [level, setLevel] = useState<string>('')
  // 2 Add anything you have
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const photoBlobs = useRef(new Map<string, Blob>())
  const [menuOpen, setMenuOpen] = useState(false)
  const [youTubeOpen, setYouTubeOpen] = useState(false)
  const [youTubeText, setYouTubeText] = useState('')
  const [attachError, setAttachError] = useState<string | null>(null)
  const [recording, setRecording] = useState<{ seconds: number } | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const fileInputs = useRef<Partial<Record<'document' | 'photo' | 'video' | 'audio', HTMLInputElement | null>>>({})
  // The AI draft
  const [drafting, setDrafting] = useState(false)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [draftNote, setDraftNote] = useState('')
  // 3 Check the AI draft
  const [badges, setBadges] = useState<string[]>([])
  const [badgeMenu, setBadgeMenu] = useState(false)
  const [tools, setTools] = useState<EditorTool[]>([])
  const [minutes, setMinutes] = useState(0)
  const [steps, setSteps] = useState<EditorStep[]>([])
  // Saving and editing
  const [editing, setEditing] = useState<{ before: { stepCount: number; toolCount: number }; published: boolean } | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'missing' | 'failed'>(skillId ? 'loading' : 'idle')
  const [saving, setSaving] = useState<'draft' | 'publish' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Editing one of your own skills: the page opens with it.
  useEffect(() => {
    if (!skillId) return
    let onScreen = true
    loadSkillForEdit(skillId).then(
      (found) => {
        if (!onScreen) return
        if (!found) return setLoadState('missing')
        const { skill } = found
        setName(skill.title)
        setDescription(skill.description ?? '')
        setTrade(skill.trade ?? '')
        setLevel(skill.level ?? '')
        setMinutes(skill.minutes ?? 0)
        setBadges(knownBadges(skill.badges))
        setTools(
          (skill.tools ?? []).map((t, i) => {
            const bytes = found.toolPhotos[i]
            return {
              name: t.name,
              alternative: t.alternative ?? '',
              photo: bytes ? { bytes, url: URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) } : null,
            }
          }),
        )
        setSteps(skill.steps.map((s) => ({ ...s, badges: knownBadges(s.badges) })))
        setEditing({ before: found.before, published: found.published })
        setLoadState('idle')
      },
      (e) => {
        console.error('Could not load the skill to edit', e)
        if (onScreen) setLoadState('failed')
      },
    )
    return () => {
      onScreen = false
    }
  }, [skillId])

  // Recording stops if the page goes away.
  useEffect(() => () => recorderRef.current?.stop(), [])

  // The design's few trades, plus one already chosen; any other is typed with + New trade.
  const trades = [...FIRST_TRADES, ...(trade && !FIRST_TRADES.includes(trade) ? [trade] : [])]
  const hasDraft = steps.length > 0 || tools.length > 0 || badges.length > 0

  function add(attachment: Omit<Attachment, 'id'>, blob?: Blob): boolean {
    const problem = attachProblem(attachments, attachment)
    if (problem) {
      setAttachError(problem)
      return false
    }
    const id = newId()
    if (blob) photoBlobs.current.set(id, blob)
    setAttachments((current) => [...current, { ...attachment, id }])
    setAttachError(null)
    return true
  }

  function remove(id: string) {
    setAttachments((current) => current.filter((a) => a.id !== id))
    photoBlobs.current.delete(id)
    setAttachError(null)
  }

  function pick(kind: AttachmentKind | 'record') {
    setMenuOpen(false)
    setAttachError(null)
    if (kind === 'youtube') return setYouTubeOpen(true)
    if (kind === 'record') return void startRecording()
    const input = kind === 'audio' ? fileInputs.current.audio : fileInputs.current[kind]
    input?.click()
  }

  async function onFiles(kind: 'document' | 'photo' | 'video' | 'audio', event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    for (const file of files) {
      try {
        if (kind === 'document') {
          const mimeType = documentType(file)
          if (!DOCUMENT_TYPES.includes(mimeType)) {
            setAttachError(`${file.name} is not a document Surtrix can read. Use ${DOCUMENT_ACCEPT.replaceAll(',', ' ')}.`)
            continue
          }
          const base64 = await readBase64(file)
          if (!add({ kind, name: file.name, detail: sizeText(file.size), mimeType, bytes: file.size, base64 })) break
        } else if (kind === 'photo') {
          const bytes = await shrinkPhoto(file, DRAFT_PHOTO_BYTES)
          const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })
          const ok = add(
            { kind, name: file.name, detail: sizeText(bytes.length), mimeType: 'image/jpeg', bytes: bytes.length, base64: await readBase64(blob), previewUrl: URL.createObjectURL(blob) },
            blob,
          )
          if (!ok) break
        } else {
          const problem = attachProblem(attachments, { kind, bytes: file.size })
          if (problem) {
            setAttachError(problem)
            break
          }
          const base64 = await readBase64(file)
          add({ kind, name: file.name, detail: sizeText(file.size), mimeType: file.type || (kind === 'video' ? 'video/mp4' : 'audio/mpeg'), bytes: file.size, base64 })
        }
      } catch (e) {
        console.error('Could not add the file', e)
        setAttachError(`Could not add ${file.name}. Try another file.`)
      }
    }
  }

  function addYouTube() {
    const url = youTubeLink(youTubeText)
    if (!url) return setAttachError('That is not a YouTube video link. Paste the link of a public or unlisted video.')
    if (add({ kind: 'youtube', name: url.replace('https://www.', ''), detail: 'YouTube video, read by AI', mimeType: 'video/mp4', bytes: 0, url })) {
      setYouTubeText('')
      setYouTubeOpen(false)
    }
  }

  async function startRecording() {
    const problem = attachProblem(attachments, { kind: 'audio', bytes: 0 })
    if (problem) return setAttachError(problem)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return setAttachError('Allow the microphone to record a voice note.')
    }
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    const started = Date.now()
    const timer = setInterval(() => {
      const seconds = (Date.now() - started) / 1000
      setRecording({ seconds })
      if (seconds >= ATTACH_LIMITS.recordSeconds) recorder.stop()
    }, 250)
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = async () => {
      clearInterval(timer)
      stream.getTracks().forEach((t) => t.stop())
      recorderRef.current = null
      setRecording(null)
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      const seconds = (Date.now() - started) / 1000
      if (blob.size === 0) return
      add({ kind: 'audio', name: 'Voice note', detail: clockText(seconds), mimeType: blob.type.split(';')[0], bytes: blob.size, base64: await readBase64(blob) })
    }
    recorderRef.current = recorder
    setRecording({ seconds: 0 })
    recorder.start()
  }

  async function draft(replace = false) {
    if (hasDraft && !replace) return setConfirmReplace(true)
    setConfirmReplace(false)
    setDrafting(true)
    setDraftError(null)
    try {
      const result = await draftSkill({ name, trade, level, notes, attachments })
      if (!result.draft) {
        setDraftError('No steps came out of this. Add a procedure, a manual or a video that shows the work.')
        return
      }
      const d = result.draft
      if (!name.trim()) setName(d.title)
      if (d.description) setDescription(d.description)
      setMinutes(d.minutes ?? 0)
      setBadges(knownBadges(d.badges))
      const photos = attachments.filter((a) => a.kind === 'photo')
      setTools(
        (d.tools ?? []).map((t, i) => {
          const source = photos[(d.toolPhotoIndex[i] ?? 0) - 1]
          const blob = source && photoBlobs.current.get(source.id)
          return { name: t.name, alternative: t.alternative ?? '', photo: blob && source.previewUrl ? { url: source.previewUrl, blob } : null }
        }),
      )
      setSteps(d.steps.map((s) => ({ ...s, badges: knownBadges(s.badges) })))
      setDraftNote(draftedFrom(attachments, notes.trim() !== ''))
      console.info(`Draft by ${DRAFT_MODEL} in ${result.ms} ms`, result.tokens)
    } catch (e) {
      console.error('The draft failed', e)
      setDraftError('Could not draft the skill right now. Try again in a moment, or add less at once.')
    } finally {
      setDrafting(false)
    }
  }

  function skillOnPage(): Skill {
    return cleanSkill({
      title: name,
      description,
      trade,
      level,
      minutes,
      badges,
      tools: tools.map((t) => ({ name: t.name, alternative: t.alternative })),
      steps: steps.map(({ editing: _editing, ...s }) => s),
    })
  }

  async function toolPhotoBytes(): Promise<(Uint8Array | null)[]> {
    const kept = tools.filter((t) => t.name.trim())
    return Promise.all(kept.map(async (t) => (t.photo ? (t.photo.bytes ?? (t.photo.blob ? await shrinkPhoto(t.photo.blob, TOOL_PHOTO_BYTES) : null)) : null)))
  }

  async function save(publish: boolean) {
    const skill = skillOnPage()
    const problem = skillProblem(skill)
    if (problem) return setSaveError(problem)
    setSaving(publish ? 'publish' : 'draft')
    setSaveError(null)
    try {
      const photos = await toolPhotoBytes()
      let id = skillId
      if (id && editing) await updateSkill(id, skill, editing.before, photos)
      else id = await saveSkill(skill, photos)
      if (expert && publish !== (editing?.published ?? false)) await setSkillPublished(id, publish, expert.name)
      window.location.hash = expert ? '#expert' : coachHash(id)
    } catch (e) {
      console.error('Could not save the skill', e)
      setSaveError('Could not save the skill. Please try again.')
      setSaving(null)
    }
  }

  function changeStep(i: number, change: Partial<EditorStep>) {
    setSteps((current) => current.map((s, j) => (j === i ? { ...s, ...change } : s)))
  }

  function changeTool(i: number, change: Partial<EditorTool>) {
    setTools((current) => current.map((t, j) => (j === i ? { ...t, ...change } : t)))
  }

  async function toolPhoto(i: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const bytes = await shrinkPhoto(file, TOOL_PHOTO_BYTES)
      changeTool(i, { photo: { bytes, url: URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })) } })
    } catch {
      setSaveError('Could not use that photo. Try another one.')
    }
  }

  const allParts = [...new Set(steps.flatMap((s) => s.parts))]
  const backHash = expert ? '#expert' : MY_SKILLS_HASH

  if (loadState === 'loading') return <Shell expert={expert}><p className="xd-muted">Loading the skill</p></Shell>
  if (loadState === 'missing' || loadState === 'failed') {
    return (
      <Shell expert={expert}>
        <p>{loadState === 'missing' ? 'This skill could not be found, or it is not yours to edit.' : 'Could not load the skill. Reload the page to try again.'}</p>
        <a className="xd-btn" href={backHash}>
          Back to my skills
        </a>
      </Shell>
    )
  }

  return (
    <Shell expert={expert}>
      <a className="cs-back" href={backHash}>
        ← Back to my skills
      </a>
      <div className="cs-title-row">
        <div>
          <h1>{skillId ? 'Edit your skill' : 'Create a skill'}</h1>
          <p className="xd-muted">Add whatever you have. Surtrix drafts the steps, tools and safety badges. You check and {expert ? 'publish' : 'save'}.</p>
        </div>
        <div className="cs-save">
          {expert ? (
            <>
              <button type="button" className="xd-btn" onClick={() => save(false)} disabled={saving !== null}>
                {saving === 'draft' ? 'Saving' : editing?.published ? 'Save and unpublish' : 'Save draft'}
              </button>
              <button type="button" className="xd-btn xd-primary" onClick={() => save(true)} disabled={saving !== null}>
                {saving === 'publish' ? 'Publishing' : editing?.published ? 'Save and keep published' : 'Publish skill'}
              </button>
            </>
          ) : (
            <button type="button" className="xd-btn xd-primary" onClick={() => save(false)} disabled={saving !== null}>
              {saving ? 'Saving' : 'Save skill'}
            </button>
          )}
        </div>
      </div>
      {saveError && <p className="xd-error" role="alert">{saveError}</p>}

      <div className="cs-columns">
        <div className="cs-left">
          <section className="xd-panel cs-section" aria-labelledby="cs-about">
            <h2 id="cs-about" className="xd-lbl">
              1 · ABOUT THE SKILL
            </h2>
            <label className="xd-field-label">
              Skill name
              <input className="xd-field" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="xd-field-label">
              Description
              <input className="xd-field" value={description} maxLength={300} placeholder="One line learners read on the card" onChange={(e) => setDescription(e.target.value)} />
            </label>
            <p className="xd-field-label">Trade</p>
            <div className="cs-chips" role="group" aria-label="Trade">
              {trades.map((t) => (
                <button key={t} type="button" className={`cs-chip${trade === t ? ' xd-on' : ''}`} aria-pressed={trade === t} onClick={() => setTrade(trade === t ? '' : t)}>
                  {t}
                </button>
              ))}
              {newTrade === null ? (
                <button type="button" className="cs-chip" onClick={() => setNewTrade('')}>
                  + New trade
                </button>
              ) : (
                <span className="cs-inline">
                  <input className="xd-field cs-small-field" value={newTrade} maxLength={60} placeholder="Trade" aria-label="New trade" onChange={(e) => setNewTrade(e.target.value)} />
                  <button
                    type="button"
                    className="xd-btn xd-gold"
                    onClick={() => {
                      if (newTrade.trim()) setTrade(newTrade.trim())
                      setNewTrade(null)
                    }}
                  >
                    Add
                  </button>
                </span>
              )}
            </div>
            <p className="xd-field-label">Level</p>
            <div className="cs-chips" role="group" aria-label="Level">
              {LEVELS.map((l) => (
                <button key={l} type="button" className={`cs-chip${level === l ? ' xd-on' : ''}`} aria-pressed={level === l} onClick={() => setLevel(level === l ? '' : l)}>
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section className="xd-panel cs-section" aria-labelledby="cs-add">
            <h2 id="cs-add" className="xd-lbl">
              2 · ADD ANYTHING YOU HAVE
            </h2>
            <div className="cs-notes">
              <textarea className="xd-field" rows={5} value={notes} aria-label="Your notes" placeholder="Paste a procedure, or write what an expert should say at each step." onChange={(e) => setNotes(e.target.value)} />
              <div className="cs-attach-row">
                <div className="cs-attach">
                  <button type="button" className="xd-btn xd-gold" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
                    <ClipIcon /> Attach
                  </button>
                  {menuOpen && (
                    <div className="cs-menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}>
                      <p className="xd-lbl">ADD TO THIS SKILL</p>
                      {(
                        [
                          ['document', 'Document'],
                          ['photo', 'Photos'],
                          ['video', 'Video'],
                          ['youtube', 'YouTube link'],
                          ['record', 'Record audio'],
                          ['audio', 'Upload audio'],
                        ] as const
                      ).map(([kind, label]) => (
                        <button key={kind} type="button" role="menuitem" className="cs-menu-item" onClick={() => pick(kind)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="xd-muted cs-hint">Documents, photos, video, YouTube or audio</span>
                {!notes && (
                  <button type="button" className="xd-btn" onClick={() => setNotes(demoProcedureText)}>
                    Try a sample
                  </button>
                )}
              </div>
            </div>
            <input ref={(el) => void (fileInputs.current.document = el)} type="file" accept={DOCUMENT_ACCEPT} multiple hidden onChange={(e) => onFiles('document', e)} />
            <input ref={(el) => void (fileInputs.current.photo = el)} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles('photo', e)} />
            <input ref={(el) => void (fileInputs.current.video = el)} type="file" accept="video/*" hidden onChange={(e) => onFiles('video', e)} />
            <input ref={(el) => void (fileInputs.current.audio = el)} type="file" accept="audio/*" hidden onChange={(e) => onFiles('audio', e)} />
            {youTubeOpen && (
              <div className="cs-inline cs-youtube">
                <input className="xd-field" value={youTubeText} aria-label="YouTube link" placeholder="https://www.youtube.com/watch?v=..." onChange={(e) => setYouTubeText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addYouTube()} />
                <button type="button" className="xd-btn xd-gold" onClick={addYouTube}>
                  Add
                </button>
                <button type="button" className="xd-btn" onClick={() => setYouTubeOpen(false)}>
                  Cancel
                </button>
              </div>
            )}
            {recording && (
              <div className="cs-recording" role="status">
                <span className="cs-rec-dot" aria-hidden="true" /> Recording {clockText(recording.seconds)} of {clockText(ATTACH_LIMITS.recordSeconds)}
                <button type="button" className="xd-btn xd-primary" onClick={() => recorderRef.current?.stop()}>
                  Stop
                </button>
              </div>
            )}
            {attachError && <p className="xd-error" role="alert">{attachError}</p>}
            {attachments.length > 0 && (
              <ul className="cs-added">
                {attachments.map((a) => (
                  <li key={a.id} className="cs-item">
                    {a.previewUrl ? <img className="cs-thumb" src={a.previewUrl} alt="" /> : <span className="cs-thumb cs-thumb-icon">{kindMark(a.kind)}</span>}
                    <span className="cs-item-text">
                      <b>{a.name}</b>
                      <span className="xd-muted">{a.detail}</span>
                    </span>
                    <button type="button" className="xd-x cs-x" aria-label={`Remove ${a.name}`} onClick={() => remove(a.id)}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cs-draft-row">
              <span className="cs-cloud">
                <i aria-hidden="true" /> IN THE CLOUD · FIREBASE AI LOGIC
              </span>
              {confirmReplace ? (
                <span className="cs-inline">
                  <span>Replace your edits?</span>
                  <button type="button" className="xd-btn xd-primary" onClick={() => draft(true)}>
                    Replace
                  </button>
                  <button type="button" className="xd-btn" onClick={() => setConfirmReplace(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="xd-btn xd-primary cs-draft" onClick={() => draft()} disabled={drafting || recording !== null || (!notes.trim() && attachments.length === 0)}>
                  {drafting ? 'Drafting the skill' : 'Draft the skill with AI'}
                </button>
              )}
            </div>
            {draftError && <p className="xd-error" role="alert">{draftError}</p>}
          </section>
        </div>

        <section className="xd-panel cs-section cs-check" aria-labelledby="cs-check">
          <div className="cs-check-head">
            <h2 id="cs-check" className="xd-lbl">
              3 · CHECK THE AI DRAFT
            </h2>
            {draftNote && <span className="xd-muted cs-from">{draftNote}</span>}
          </div>

          <h3>Safety badges</h3>
          <p className="xd-muted xd-small-text">Suggested by AI from your material. Remove any that do not apply, or add more.</p>
          <ul className="cs-badges">
            {knownBadges(badges).map((id) => (
              <li key={id}>
                <SafetyBadges badges={[id]} />
                <button type="button" className="xd-x cs-x" aria-label={`Remove ${BADGES[id].label}`} onClick={() => setBadges(badges.filter((b) => b !== id))}>
                  ✕
                </button>
              </li>
            ))}
            <li className="cs-badge-add">
              <button type="button" className="xd-btn" aria-expanded={badgeMenu} onClick={() => setBadgeMenu(!badgeMenu)}>
                + Add badge
              </button>
            </li>
          </ul>
          {badgeMenu && <BadgePicker chosen={badges} onPick={(id) => { setBadges([...badges, id]); setBadgeMenu(false) }} />}

          <h3>Tools needed</h3>
          {tools.length === 0 && <p className="xd-muted xd-small-text">No tools yet. Draft with AI, or add one.</p>}
          <ul className="cs-tools">
            {tools.map((t, i) => (
              <li key={i} className="cs-tool">
                <label className="cs-tool-photo">
                  {t.photo ? <img src={t.photo.url} alt={`Photo of ${t.name || 'the tool'}`} /> : <span aria-hidden="true">+</span>}
                  <span className="sb-hidden">{t.photo ? 'Change the photo' : 'Add a photo'} of {t.name || 'this tool'}</span>
                  <input type="file" accept="image/*" hidden onChange={(e) => toolPhoto(i, e)} />
                </label>
                <span className="cs-tool-text">
                  <input className="xd-field cs-small-field" value={t.name} aria-label={`Tool ${i + 1} name`} placeholder="Tool" maxLength={200} onChange={(e) => changeTool(i, { name: e.target.value })} />
                  <input className="xd-field cs-small-field" value={t.alternative} aria-label={`Tool ${i + 1} alternative`} placeholder="No iron? What to use instead" maxLength={200} onChange={(e) => changeTool(i, { alternative: e.target.value })} />
                </span>
                <button type="button" className="xd-x cs-x" aria-label={`Remove ${t.name || 'this tool'}`} onClick={() => setTools(tools.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="xd-btn" onClick={() => setTools([...tools, { name: '', alternative: '', photo: null }])}>
            + Add a tool with a photo
          </button>

          <h3>Parts</h3>
          {allParts.length === 0 ? (
            <p className="xd-muted xd-small-text">Parts come from the steps. Edit a step to add them.</p>
          ) : (
            <ul className="cs-parts">
              {allParts.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <h3>
            Steps <span className="xd-muted cs-steps-count">{steps.length} {steps.length === 1 ? 'step' : 'steps'}{minutes ? ` · about ${minutes} min` : ''}</span>
          </h3>
          <label className="xd-field-label cs-minutes">
            Time in minutes
            <input className="xd-field cs-small-field" type="number" min={0} max={600} value={minutes || ''} onChange={(e) => setMinutes(Number(e.target.value) || 0)} />
          </label>
          <ol className="cs-steps">
            {steps.map((s, i) => (
              <li key={i} className="cs-step">
                <span className="cs-num">{i + 1}</span>
                {s.editing ? (
                  <div className="cs-step-edit">
                    <input className="xd-field" value={s.title} aria-label={`Step ${i + 1} title`} placeholder="Title" maxLength={200} onChange={(e) => changeStep(i, { title: e.target.value })} />
                    <textarea className="xd-field" rows={3} value={s.instruction} aria-label={`Step ${i + 1} instruction`} placeholder="What to do" maxLength={2000} onChange={(e) => changeStep(i, { instruction: e.target.value })} />
                    <input className="xd-field" value={s.doneWhen} aria-label={`Step ${i + 1} done when`} placeholder="Done when" maxLength={1000} onChange={(e) => changeStep(i, { doneWhen: e.target.value })} />
                    <input className="xd-field" value={s.parts.join(', ')} aria-label={`Step ${i + 1} parts`} placeholder="Parts, with commas" onChange={(e) => changeStep(i, { parts: e.target.value.split(',') })} />
                    <input className="xd-field" value={s.tools.join(', ')} aria-label={`Step ${i + 1} tools`} placeholder="Tools, with commas" onChange={(e) => changeStep(i, { tools: e.target.value.split(',') })} />
                    <BadgePicker chosen={s.badges} toggle onPick={(id) => changeStep(i, { badges: s.badges.includes(id) ? s.badges.filter((b) => b !== id) : [...s.badges, id] })} />
                    <div className="xd-btns">
                      <button type="button" className="xd-btn xd-primary" onClick={() => changeStep(i, { editing: false, parts: s.parts.map((p) => p.trim()).filter(Boolean), tools: s.tools.map((p) => p.trim()).filter(Boolean) })}>
                        Done
                      </button>
                      <button type="button" className="xd-btn" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                        Remove step
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="cs-step-view">
                    <div className="cs-step-top">
                      <b>{s.title || 'Untitled step'}</b>
                      <button type="button" className="xd-btn xd-small" onClick={() => changeStep(i, { editing: true })}>
                        Edit
                      </button>
                    </div>
                    <p className="xd-muted">{s.instruction}</p>
                    <SafetyBadges badges={s.badges} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="xd-btn" onClick={() => setSteps([...steps, { title: '', instruction: '', parts: [], tools: [], doneWhen: '', badges: [], editing: true }])}>
            + Add a step
          </button>
        </section>
      </div>
    </Shell>
  )
}

function Shell({ expert, children }: { expert: { name: string } | null; children: ReactNode }) {
  return (
    <div className="xd">
      <header className="xd-header">
        <div className="xd-brand">
          <a href="#" aria-label="Surtrix home">
            <Wordmark white />
          </a>
          {expert && <span className="xd-lbl xd-brand-label">EXPERT</span>}
        </div>
        <nav className="xd-nav" aria-label="Pages">
          {expert ? (
            <>
              <a className="xd-navpill" href="#expert">
                My skills
              </a>
              <a className="xd-navpill" href={SKILLS_HASH}>
                Skills library
              </a>
            </>
          ) : (
            <>
              <a className="xd-navpill" href={SKILLS_HASH}>
                Skills
              </a>
              <a className="xd-navpill" href={MY_SKILLS_HASH}>
                My skills
              </a>
            </>
          )}
        </nav>
        {expert && (
          <span className="xd-who">
            {expert.name} <span className="xd-vb" aria-label="verified expert">✓</span>
          </span>
        )}
      </header>
      <main className="xd-wrap cs-wrap">{children}</main>
    </div>
  )
}

// Every badge as a pill to pick; with toggle, the chosen ones show as chosen.
function BadgePicker({ chosen, onPick, toggle = false }: { chosen: readonly string[]; onPick: (id: BadgeId) => void; toggle?: boolean }) {
  const ids = (Object.keys(BADGES) as BadgeId[]).filter((id) => toggle || !chosen.includes(id))
  return (
    <div className="cs-picker" role="group" aria-label="Safety badges">
      {ids.map((id) => (
        <button key={id} type="button" className={`cs-pick sb sb-${BADGES[id].kind}${chosen.includes(id) ? ' cs-picked' : ''}`} aria-pressed={toggle ? chosen.includes(id) : undefined} onClick={() => onPick(id)}>
          <BadgeIcon id={id} />
          {BADGES[id].label}
        </button>
      ))}
    </div>
  )
}

function kindMark(kind: AttachmentKind): string {
  return { document: 'DOC', photo: 'IMG', video: 'VID', youtube: 'YT', audio: 'MIC' }[kind]
}

function ClipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10 17.4a1.7 1.7 0 0 1-2.4-2.4l8-8" />
    </svg>
  )
}
