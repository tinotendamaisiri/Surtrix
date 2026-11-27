// Create a skill (#106): one Firebase AI Logic call drafts the skill from the expert's notes
// and attachments. Files go inline (the Gemini Developer API takes no Cloud Storage links);
// a YouTube link goes as a link. Nothing attached is stored.
import { getGenerativeModel, InferenceMode, Schema, ThinkingLevel, type Part } from 'firebase/ai'
import { ai } from './firebase'
import { ATTACH_LIMITS, BADGE_IDS, DRAFT_INSTRUCTION, DRAFT_MODEL, parseDraft, youTubePart, type Attachment, type Draft } from './skillDraft'
import { MAX_STEPS } from './skill'

const badgeList = () => Schema.array({ items: Schema.enumString({ enum: BADGE_IDS }) })

const draftSchema = Schema.object({
  properties: {
    title: Schema.string({ description: 'A short name for the skill.' }),
    description: Schema.string({ description: 'One sentence a learner reads on the skill card.' }),
    minutes: Schema.integer({ description: 'About how many minutes the whole skill takes.' }),
    badges: badgeList(),
    tools: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          alternative: Schema.string({ description: 'What to use without it, starting with the question, or empty.' }),
          photo: Schema.integer({ description: 'The number of the attached photo that shows this tool, or 0.' }),
        },
        propertyOrdering: ['name', 'alternative', 'photo'],
      }),
    }),
    steps: Schema.array({
      maxItems: MAX_STEPS,
      items: Schema.object({
        properties: {
          title: Schema.string(),
          instruction: Schema.string(),
          parts: Schema.array({ items: Schema.string() }),
          tools: Schema.array({ items: Schema.string() }),
          doneWhen: Schema.string({ description: 'What the bench looks like when this step is done.' }),
          badges: badgeList(),
        },
        propertyOrdering: ['title', 'instruction', 'parts', 'tools', 'doneWhen', 'badges'],
      }),
    }),
  },
  propertyOrdering: ['title', 'description', 'minutes', 'badges', 'tools', 'steps'],
})

const draftModel = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: DRAFT_MODEL,
    systemInstruction: DRAFT_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: draftSchema,
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  },
})

export type DraftResult = {
  draft: Draft | null
  ms: number
  tokens: { prompt: number; output: number; thinking: number | null } | null
}

// The request's parts: what the expert said, then each attachment with a label, photos
// numbered so the model can say which one shows a tool.
export function draftParts(input: { name: string; trade: string; level: string; notes: string; attachments: readonly Attachment[] }): Part[] {
  const parts: Part[] = [
    {
      type: 'text',
      text: [
        `Skill name from the expert: ${input.name || '(none yet)'}`,
        `Trade: ${input.trade || '(not chosen)'}. Level: ${input.level || '(not chosen)'}.`,
        `The expert's notes:\n${input.notes.trim().slice(0, ATTACH_LIMITS.notesChars) || '(none)'}`,
      ].join('\n'),
    },
  ]
  let photo = 0
  for (const a of input.attachments) {
    const label = a.kind === 'photo' ? `Photo ${++photo} (${a.name}):` : `${a.kind === 'youtube' ? 'YouTube video' : a.kind[0].toUpperCase() + a.kind.slice(1)} (${a.name}):`
    parts.push({ type: 'text', text: label })
    if (a.kind === 'youtube' && a.url) parts.push(youTubePart(a.url))
    else if (a.base64) parts.push({ type: 'inlineData', inlineData: { mimeType: a.mimeType, data: a.base64 } })
  }
  return parts
}

export async function draftSkill(input: Parameters<typeof draftParts>[0]): Promise<DraftResult> {
  const started = performance.now()
  const result = await draftModel.generateContent(draftParts(input))
  const ms = Math.round(performance.now() - started)
  const usage = result.response.usageMetadata
  const photos = input.attachments.filter((a) => a.kind === 'photo').length
  let draft
  try {
    draft = parseDraft(result.response.text(), photos)
  } catch (e) {
    console.error('Unusable draft, finish reason:', result.response.candidates?.[0]?.finishReason)
    throw e
  }
  return {
    draft,
    ms,
    tokens: usage ? { prompt: usage.promptTokenCount, output: usage.candidatesTokenCount, thinking: usage.thoughtsTokenCount ?? null } : null,
  }
}
