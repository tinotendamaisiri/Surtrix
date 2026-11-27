import { describe, expect, test } from 'vitest'
import { publishedSkillMatches } from '../src/skillsPage.ts'
import { ATTACH_LIMITS, attachProblem, cleanSkill, draftedFrom, parseDraft, skillProblem, youTubeLink, type Attachment } from '../src/skillDraft.ts'

const a = (kind: Attachment['kind'], bytes = 1000): Attachment => ({ id: Math.random().toString(), kind, name: kind, detail: '', mimeType: 'x', bytes })
const step = { title: 'Heat the iron', instruction: 'Set 330 C.', parts: [], tools: ['iron'], doneWhen: 'Solder melts on the tip.' }

describe('attaching', () => {
  test('one video, one YouTube link and one audio; up to 3 documents and 10 photos', () => {
    expect(attachProblem([a('video')], a('video'))).toMatch(/Only one video/)
    expect(attachProblem([a('youtube', 0)], a('youtube', 0))).toMatch(/Only one YouTube link/)
    expect(attachProblem([a('audio')], a('audio'))).toMatch(/Only one voice note/)
    expect(attachProblem([a('document'), a('document')], a('document'))).toBeNull()
    expect(attachProblem([a('document'), a('document'), a('document')], a('document'))).toMatch(/Up to 3 documents/)
    expect(attachProblem(Array.from({ length: 10 }, () => a('photo')), a('photo'))).toMatch(/Up to 10 photos/)
  })

  test('everything together stays under 14 MB, with a plain word for a large video', () => {
    expect(attachProblem([], a('video', ATTACH_LIMITS.totalBytes + 1))).toMatch(/This video is too large .* Trim it or use a YouTube link\./)
    expect(attachProblem([a('document', 10 * 1024 * 1024)], a('photo', 5 * 1024 * 1024))).toMatch(/can add up to 14 MB/)
    expect(attachProblem([], a('video', ATTACH_LIMITS.totalBytes))).toBeNull()
  })

  test('a YouTube link, in its usual forms, made plain; anything else refused', () => {
    expect(youTubeLink('https://youtu.be/jNQXAC9IVRw')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
    expect(youTubeLink(' https://www.youtube.com/watch?v=jNQXAC9IVRw&t=4 ')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
    expect(youTubeLink('https://m.youtube.com/shorts/jNQXAC9IVRw')).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw')
    expect(youTubeLink('https://vimeo.com/123')).toBeNull()
    expect(youTubeLink('not a link')).toBeNull()
  })

  test('drafted from what was given', () => {
    expect(draftedFrom([a('document'), a('photo'), a('photo'), a('photo'), a('youtube'), a('audio')], false)).toBe('Drafted from 1 document, 3 photos, 1 video and 1 voice note')
    expect(draftedFrom([], true)).toBe('Drafted from your notes')
  })
})

describe('the AI draft', () => {
  test('keeps steps with badges, tools with alternatives, and photo numbers that exist', () => {
    const draft = parseDraft(
      JSON.stringify({
        title: 'Solder header pins',
        description: 'Tack one pin first.',
        minutes: 20.4,
        badges: ['fumes', 'laser'],
        tools: [
          { name: 'Soldering iron', alternative: 'No iron? A gas pen works.', photo: 2 },
          { name: 'Clamp', alternative: '', photo: 9 },
          { name: ' ', alternative: 'x', photo: 1 },
        ],
        steps: [{ ...step, badges: ['heat-burns'] }],
      }),
      3,
    )
    expect(draft).toMatchObject({ title: 'Solder header pins', description: 'Tack one pin first.', minutes: 20, badges: ['fumes'] })
    expect(draft?.tools).toEqual([{ name: 'Soldering iron', alternative: 'No iron? A gas pen works.' }, { name: 'Clamp' }])
    expect(draft?.toolPhotoIndex).toEqual([2, 0])
    expect(draft?.steps[0].badges).toEqual(['heat-burns'])
  })

  test('no procedure gives no draft', () => {
    expect(parseDraft(JSON.stringify({ title: '', steps: [] }), 0)).toBeNull()
  })
})

describe('saving', () => {
  test('says what is missing', () => {
    expect(skillProblem({ title: ' ', steps: [step] })).toBe('Give the skill a name.')
    expect(skillProblem({ title: 'Solder', steps: [] })).toMatch(/at least one step/)
    expect(skillProblem({ title: 'Solder', steps: [{ ...step, doneWhen: '' }] })).toMatch(/Step 1 needs/)
    expect(skillProblem({ title: 'Solder', steps: [step] })).toBeNull()
  })

  test('refuses a part, tool or alternative longer than the rules allow', () => {
    const long = 'x'.repeat(201)
    expect(skillProblem({ title: 'Solder', steps: [{ ...step, parts: [long] }] })).toMatch(/Step 1 has a part or tool name/)
    expect(skillProblem({ title: 'Solder', steps: [{ ...step, tools: [long] }] })).toMatch(/Step 1 has a part or tool name/)
    expect(skillProblem({ title: 'Solder', steps: [step], tools: [{ name: 'Iron', alternative: long }] })).toMatch(/tool's name and alternative/)
    expect(skillProblem({ title: 'Solder', steps: [{ ...step, parts: ['x'.repeat(200)] }], tools: [{ name: 'x'.repeat(200) }] })).toBeNull()
  })

  test('saves trimmed text and leaves out what is empty', () => {
    expect(cleanSkill({ title: ' Solder ', steps: [{ ...step, parts: [' pin ', ''], badges: ['gloves', 'x'] }], trade: ' ', description: '', minutes: 0, tools: [{ name: ' Iron ', alternative: ' ' }, { name: '' }] })).toEqual({
      title: 'Solder',
      steps: [{ ...step, parts: ['pin'], badges: ['gloves'] }],
      tools: [{ name: 'Iron' }],
    })
  })
})

describe('published skills by trade (#106)', () => {
  const skill = { id: 's', title: 'Solder pins', stepCount: 2, expertName: 'Tino', publishedAt: 1, trade: 'Soldering', description: 'Tack one pin first.' }
  test('show under their own trade and are found by their description', () => {
    expect(publishedSkillMatches(skill, '', 'Soldering')).toBe(true)
    expect(publishedSkillMatches(skill, '', 'Plumbing')).toBe(false)
    expect(publishedSkillMatches(skill, 'tack one', 'All')).toBe(true)
  })
})
