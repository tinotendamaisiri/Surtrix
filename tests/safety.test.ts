import { describe, expect, test } from 'vitest'
import { stepSpeech } from '../src/coachVoice.ts'
import { demoSkill } from '../src/demoSkill.ts'
import { badgeSpeech, BADGES, cardBadges, isBadgeId, knownBadges, skillBadges } from '../src/safety.ts'
import { exampleSkills, pinnedSkill } from '../src/skillCatalog.ts'

describe('badges', () => {
  test('there are 5 to wear and 5 to watch out for', () => {
    const kinds = Object.values(BADGES).map((b) => b.kind)
    expect(kinds.filter((k) => k === 'wear')).toHaveLength(5)
    expect(kinds.filter((k) => k === 'hazard')).toHaveLength(5)
  })

  test('knownBadges keeps known ids once, wear first then hazards, and drops anything else', () => {
    expect(knownBadges(['fumes', 'gloves', 'laser', 'fumes', 3, 'safety-glasses'])).toEqual(['safety-glasses', 'gloves', 'fumes'])
    expect(knownBadges(undefined)).toEqual([])
    expect(isBadgeId('toString')).toBe(false)
  })

  test("a skill's badges are its own plus every step's", () => {
    expect(skillBadges(['ear-protection'], [{ badges: ['electricity'] }, {}, { badges: ['gloves', 'electricity'] }])).toEqual([
      'gloves',
      'ear-protection',
      'electricity',
    ])
  })

  test('a card shows at most 3, and counts the rest', () => {
    expect(cardBadges(['gloves', 'fumes'])).toEqual({ shown: ['gloves', 'fumes'], more: 0 })
    expect(cardBadges(['helmet', 'gloves', 'electricity', 'heat-burns', 'fumes'])).toEqual({ shown: ['gloves', 'helmet', 'electricity'], more: 2 })
  })
})

describe('what the coach says', () => {
  test('wear first, then what to watch out for; nothing without badges', () => {
    expect(badgeSpeech([])).toBe('')
    expect(badgeSpeech(['gloves'])).toBe('Wear gloves.')
    expect(badgeSpeech(['electricity'])).toBe('Watch out for electricity.')
    expect(badgeSpeech(['fumes', 'safety-glasses', 'respirator', 'heat-burns', 'sharp-edges'])).toBe(
      'Wear safety glasses and a respirator. Watch out for heat and burns, fumes and sharp edges.',
    )
  })

  test("the step's badges come before its instruction", () => {
    expect(stepSpeech(4, 4, 'Connect the power', 'Switch it on.', ['electricity'])).toBe('Step 4 of 4, Connect the power. Watch out for electricity. Switch it on.')
    expect(stepSpeech(1, 4, 'Place the LED', 'Push it in.')).toBe('Step 1 of 4, Place the LED. Push it in.')
  })
})

describe('badges on the catalog and the demo', () => {
  test('every card has a list of known badges, each once', () => {
    for (const skill of [pinnedSkill, ...exampleSkills]) {
      expect(knownBadges(skill.badges), skill.title).toHaveLength(skill.badges.length)
    }
    expect(exampleSkills.filter((s) => s.badges.length > 0).length).toBeGreaterThan(30)
  })

  test('the LED demo: electricity on step 4 only, and on its card', () => {
    expect(demoSkill.steps.map((s) => s.badges ?? [])).toEqual([[], [], [], ['electricity']])
    expect(pinnedSkill.badges).toEqual(['electricity'])
  })
})
