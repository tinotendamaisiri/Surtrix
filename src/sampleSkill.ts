import type { CoachSkill } from './coach.ts'

// The hard coded sample skill, for the REXQualis kit with its USB power module. Its ids
// are fixed in the Contracts of the build plan: plan issue 11 seeds the same skill with
// the same ids, and then this copy goes away.
export const sampleSkill: CoachSkill = {
  id: 'sample-led',
  title: 'Light an LED with a resistor',
  steps: [
    {
      id: 'step-1',
      title: 'Place the LED',
      instruction:
        'Push the LED into the middle of the breadboard with its long leg and its short leg in two different rows. The long leg is the positive side.',
      parts: ['breadboard', 'LED'],
      doneWhen: "The LED's two legs sit in two different rows in the middle of the breadboard.",
    },
    {
      id: 'step-2',
      title: 'Add the resistor',
      instruction:
        "Take a 220 or 330 ohm resistor from the kit. Put one leg in the red positive rail and the other leg in the same row as the LED's long leg.",
      parts: ['220 or 330 ohm resistor'],
      doneWhen: "A 220 or 330 ohm resistor joins the red positive rail to the row of the LED's long leg.",
    },
    {
      id: 'step-3',
      title: 'Add the wire',
      instruction: "Use a jumper wire to join the row of the LED's short leg to the blue negative rail.",
      parts: ['jumper wire'],
      doneWhen: "A jumper wire joins the row of the LED's short leg to the blue negative rail.",
    },
    {
      id: 'step-4',
      title: 'Connect the power',
      instruction:
        'With the power module switched off, plug it onto the end of the breadboard so its pins sit in the rails, and set it to 5 V. Then connect the USB cable and switch the module on.',
      parts: ['power module', 'USB cable'],
      doneWhen: 'The LED is lit.',
    },
  ],
}

// The skills on the home screen. Plan issue 3 adds the saved skills.
export const skills: CoachSkill[] = [sampleSkill]
