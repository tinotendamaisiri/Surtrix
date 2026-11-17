// The skill cards in the landing page's "All skills" carousel (#51), in the approved
// design's order. Only the LED card is a real skill: it opens the demo. The other 13
// are examples, shown exactly as designed and not clickable, until experts publish real
// skills (#52).
import { DEMO_SKILL_ID } from './demoSkill.ts'
import { coachHash } from './screenAddress.ts'

export type LandingSkill = {
  trade: string
  title: string
  text: string
  verifiedBy: string
  stepCount: number
  // A file in public/landing.
  image: string
  // Set only on the live demo card.
  href?: string
}

export const HERO_IMAGE = 'hero.jpg'
// The same photo for phone widths, where the hero is narrower.
export const HERO_SMALL_IMAGE = 'hero-small.jpg'

export const landingSkills: readonly LandingSkill[] = [
  {
    trade: 'Auto mechanics',
    title: 'Replace front brake pads',
    text: 'Lift, remove the caliper, swap the pads, torque to spec.',
    verifiedBy: 'a mechanic',
    stepCount: 9,
    image: 'skill-brakes.jpg',
  },
  {
    trade: 'Phone repair',
    title: 'Replace a phone screen',
    text: 'Heat, open, disconnect the battery first, fit the new panel.',
    verifiedBy: 'a repair tech',
    stepCount: 11,
    image: 'skill-phone.jpg',
  },
  {
    trade: 'Welding',
    title: 'Run a MIG tack weld',
    text: 'Clean the joint, set wire speed and voltage, tack both ends.',
    verifiedBy: 'a welder',
    stepCount: 7,
    image: 'skill-welding.jpg',
  },
  {
    trade: 'Machine assembly',
    title: 'Assemble a gearbox',
    text: 'Seat the bearings, mesh the gears, close and check the backlash.',
    verifiedBy: 'an assembler',
    stepCount: 14,
    image: 'skill-gearbox.jpg',
  },
  {
    trade: 'Electronics',
    title: 'Light an LED with a resistor',
    text: 'Place the LED, add the resistor and the wire, then power on.',
    verifiedBy: 'the Surtrix team',
    stepCount: 4,
    image: 'skill-led.jpg',
    href: coachHash(DEMO_SKILL_ID),
  },
  {
    trade: 'HVAC',
    title: 'Check AC refrigerant pressure',
    text: 'Connect the gauges, read both sides, compare to the chart.',
    verifiedBy: 'an HVAC tech',
    stepCount: 8,
    image: 'skill-hvac.jpg',
  },
  {
    trade: 'Auto mechanics',
    title: 'Change the engine oil',
    text: 'Drain, swap the filter, refill to the mark, check for leaks.',
    verifiedBy: 'a mechanic',
    stepCount: 10,
    image: 'skill-oil.jpg',
  },
  {
    trade: 'Plumbing',
    title: 'Replace a faucet cartridge',
    text: 'Shut off the water, pull the old cartridge, seat the new one.',
    verifiedBy: 'a plumber',
    stepCount: 7,
    image: 'skill-plumbing.jpg',
  },
  {
    trade: 'Electrical',
    title: 'Wire a control panel relay',
    text: 'Isolate power, land each wire, test before closing the panel.',
    verifiedBy: 'an electrician',
    stepCount: 12,
    image: 'skill-electrical.jpg',
  },
  {
    trade: 'Soldering',
    title: 'Solder header pins to a board',
    text: 'Tack one pin, check it is straight, then solder the rest.',
    verifiedBy: 'an electronics tech',
    stepCount: 6,
    image: 'skill-solder.jpg',
  },
  {
    trade: '3D printing',
    title: 'Swap a 3D printer nozzle',
    text: 'Heat the hotend, unscrew the old nozzle, tighten the new one hot.',
    verifiedBy: 'a maker',
    stepCount: 6,
    image: 'skill-printer.jpg',
  },
  {
    trade: 'Bike repair',
    title: 'Adjust disc brakes',
    text: 'Center the caliper, set the lever feel, check for rub.',
    verifiedBy: 'a bike mechanic',
    stepCount: 5,
    image: 'skill-bike.jpg',
  },
  {
    trade: 'Drone repair',
    title: 'Replace a drone motor',
    text: 'Remove the arm cover, desolder the old motor, fit and test.',
    verifiedBy: 'a drone tech',
    stepCount: 9,
    image: 'skill-drone.jpg',
  },
  {
    trade: 'Laptop repair',
    title: 'Replace a laptop battery',
    text: 'Power down, open the base, unplug and swap the pack.',
    verifiedBy: 'a repair tech',
    stepCount: 8,
    image: 'skill-laptop.jpg',
  },
]
