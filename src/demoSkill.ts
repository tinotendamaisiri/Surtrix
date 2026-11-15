import type { Skill } from './skill.ts'

// The demo skill, for the REXQualis kit with its USB power module. It is a real saved
// skill in Firestore, written by scripts/seedDemoSkill.ts (#25); the app reads it like any
// other skill. Its ids are fixed in the Contracts: questions and expert answers point at
// skills/sample-led/steps/step-1 to step-4, so they never change.
export const DEMO_SKILL_ID = 'sample-led'

// No learner has this user id, so the demo skill is in nobody's own list and nobody can
// add steps to it.
export const DEMO_CREATOR_ID = 'surtrix'

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
