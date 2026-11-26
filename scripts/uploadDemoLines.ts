// Writes the demo skill's coach lines (#100) from the file scripts/makeDemoLines.ts saved,
// as skills/sample-led/steps/{stepId}/speech/{key}-{part}, one commit per step. It writes
// with the owner's credentials, so the rules (which keep everyone else out of the demo
// skill) do not apply to it. Rerunning it rewrites the same documents.
//   node --env-file-if-exists=.env.local scripts/uploadDemoLines.ts emulator demo-lines.json
//   GOOGLE_ACCESS_TOKEN=... node scripts/uploadDemoLines.ts real demo-lines.json
import { readFileSync } from 'node:fs'
import { checkMadeLines, demoLineWrites, type MadeLines } from './demoLines.ts'
import { targetFrom } from './seedDemoSkill.ts'

if (import.meta.main) {
  try {
    const [where, file] = process.argv.slice(2)
    if (!file) throw new Error('Usage: node scripts/uploadDemoLines.ts emulator|real <demo-lines.json>')
    const target = targetFrom(where)
    const made = JSON.parse(readFileSync(file, 'utf8')) as MadeLines
    await checkMadeLines(made)
    const headers: Record<string, string> = { Authorization: `Bearer ${target.token}`, 'Content-Type': 'application/json' }
    if (target.userProject) headers['x-goog-user-project'] = target.userProject
    const url = `${target.baseUrl}/v1/projects/${target.projectId}/databases/(default)/documents:commit`
    for (const stepId of [...new Set(made.lines.map((l) => l.stepId))]) {
      const writes = demoLineWrites(target.projectId, made.lines.filter((l) => l.stepId === stepId))
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ writes }) })
      if (!response.ok) throw new Error(`Writing ${stepId} failed: ${response.status} ${await response.text()}`)
      console.log(`${stepId}: ${writes.length} documents`)
    }
    console.log(`Wrote ${made.lines.length} demo lines (${where}, ${target.projectId}).`)
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
