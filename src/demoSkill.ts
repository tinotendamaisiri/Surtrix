import type { Skill } from './skill.ts'

// The demo skill, for the REXQualis kit with its USB power module. It is a real saved
// skill in Firestore, written by scripts/seedDemoSkill.ts (#25); the app reads it like any
// other skill. Its ids are fixed in the Contracts: questions and expert answers point at
// skills/sample-led/steps/step-1 to step-4, so they never change.
export const DEMO_SKILL_ID = 'sample-led'

// No learner has this user id, so the demo skill is in nobody's own list and nobody can
// add steps to it. The seeded answers use it as their expertId too: no real person wrote them.
export const DEMO_CREATOR_ID = 'surtrix'

// The name learners see on the seeded answers.
export const DEMO_EXPERT_NAME = 'Surtrix team'

// Change this text only through the seed script, and keep the 4 steps in this order.
export const demoSkill: Skill = {
  title: 'Light an LED with a resistor',
  steps: [
    {
      title: 'Place the LED',
      instruction:
        'Push the LED into the middle of the breadboard with its long leg and its short leg in two different rows. The long leg is the positive side.',
      parts: ['breadboard', 'LED'],
      doneWhen: "The LED's two legs sit in two different rows in the middle of the breadboard.",
    },
    {
      title: 'Add the resistor',
      instruction:
        "Take a 220 or 330 ohm resistor from the kit. Put one leg in the red positive rail and the other leg in the same row as the LED's long leg.",
      parts: ['220 or 330 ohm resistor'],
      doneWhen: "A 220 or 330 ohm resistor joins the red positive rail to the row of the LED's long leg.",
    },
    {
      title: 'Add the wire',
      instruction: "Use a jumper wire to join the row of the LED's short leg to the blue negative rail.",
      parts: ['jumper wire'],
      doneWhen: "A jumper wire joins the row of the LED's short leg to the blue negative rail.",
    },
    {
      title: 'Connect the power',
      instruction:
        'With the power module switched off, plug it onto the end of the breadboard so its pins sit in the rails, and set it to 5 V. Then connect the USB cable and switch the module on.',
      parts: ['power module', 'USB cable'],
      doneWhen: 'The LED is lit.',
    },
  ],
}

// The same procedure as plain text, for Try a sample on the New skill screen.
export const demoProcedureText = `Light an LED with a resistor

You need: a breadboard, an LED, a 220 or 330 ohm resistor, a jumper wire, and the USB power module with its USB cable.

1. Place the LED. Push the LED into the middle of the breadboard with its long leg and its short leg in two different rows. The long leg is the positive side.
2. Add the resistor. Take a 220 or 330 ohm resistor from the kit. Put one leg in the red positive rail and the other leg in the same row as the LED's long leg.
3. Add the wire. Use a jumper wire to join the row of the LED's short leg to the blue negative rail.
4. Connect the power last. With the power module switched off, plug it onto the end of the breadboard so its pins sit in the rails, and set it to 5 V. Then connect the USB cable and switch the module on. The LED lights up.
`

// Saved expert answers for the demo skill (#29), in the answers shape from the Contracts,
// each on the step where a learner meets the problem. They have no question document: the
// id is a fixed seed id, which never changes, and the answer's questionId repeats it.
export type DemoAnswer = { stepId: string; id: string; question: string; answer: string }

export const demoAnswers: DemoAnswer[] = [
  {
    stepId: 'step-2',
    id: 'demo-led-in-rail',
    question: 'I pushed the LED straight into the red rail and put the resistor on its other leg. Is that right?',
    answer:
      "Not for this skill. Take the LED out of the rail and put its two legs in two different rows in the middle of the breadboard. Then put the resistor between the red positive rail and the row of the LED's long leg. All the current has to pass through the resistor, because an LED with nothing to limit its current can burn out in a moment. A resistor on the negative side would also limit the current, but this skill puts it on the positive side, so keep it there.",
  },
  {
    stepId: 'step-4',
    id: 'demo-led-backwards',
    question:
      'The power is on but my LED does not light, and its long leg is on the blue side. Does it matter which way round it goes?',
    answer:
      "Yes. An LED only lets current through one way, so a backwards LED will not light. The long leg is positive: it goes to the row the resistor joins to the red rail. The short leg goes to the row wired to the blue rail. The short leg is also on the side where the LED's rim is flat. Switch the power off, then turn the LED around. At 5 V with the resistor in place, a backwards LED is not usually harmed.",
  },
  {
    stepId: 'step-4',
    id: 'demo-no-power',
    question: 'Everything looks wired right but the LED does not light. What should I check?',
    answer:
      "Check the power module first. Its switch should be on and its own light lit. The jumper for each side should be on 5 V, not 3.3 V or OFF. It should sit the right way round, with + on the red rail and minus on the blue rail. Its pins should be pushed fully into the rails, and the USB cable should go to a port or charger that gives power. If the module is fine, switch it off and check the LED's long leg is on the resistor's side.",
  },
]
