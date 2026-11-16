# Surtrix

Surtrix is an AI bench coach for hands-on electronics work. You upload a procedure
(a manual, SOP or guide), point a camera at your bench, and Surtrix guides you step
by step, catches mistakes, and calls a live human expert when the AI is unsure.
Expert answers are saved to the skill and reused, including offline.

Built for the Google #BuildHybridAI 2026 hackathon.

The app today has these screens:

* Home lists the skills: the demo skill (lighting an LED with a resistor on a
  breadboard), then the skills you saved, newest first. The demo skill is stored in
  Firestore like any saved skill.
* The coach (`#coach/{skill id}`) walks you through a skill one step at a time, next
  to a live camera preview. You move with Back and Next. With the camera on, Mark
  step done first has `gemini-4-hydrogen` in the cloud check the wiring against the
  step: if it is right the coach moves on; if not, it says what is wrong and what to
  move; if it cannot tell, Ask an Expert opens with its words. After any of those, or
  a failed check, Mark done anyway moves on. A check that takes over 8 seconds lets
  you carry on while it runs; at 30 seconds it gives up, and a failed check points to
  the step's saved answers and Ask an Expert. With the camera off, Mark step done
  moves on unchecked. While the camera is on, Gemini Nano in Chrome on a computer
  watches the bench on device: it says which of the step's parts it sees and whether
  an LED is lit. An answer takes about 2 to 4 seconds and the next look starts 3
  seconds later, so it answers about every 5 to 7 seconds. The first answer takes
  longer while Chrome loads the model. It never calls the cloud and never moves
  the step. Elsewhere the coach says watching needs Chrome on a computer. Ask an
  Expert sends the current camera frame and your question about the step to a human
  expert, and lists your questions for the step with the expert's reply as soon as
  it arrives.
  In the same panel, Check saved answers picks the saved expert answer for the step
  that fits your question, or says none fits: on device with Gemini Nano first, also
  offline, and with `gemini-3.5-flash-lite` in the cloud when Nano is not available.
  It shows which path answered. Saved answers load when the coach opens, so they
  still help if the network drops. When no model can answer, it lists the step's
  saved answers.
* The expert dashboard (`#expert`): an expert signs in with Google and sees every
  open question with the learner's photo and step, oldest first, and replies. The
  reply reaches the learner live and is saved under the skill's step. Only Google
  accounts the Surtrix team lists in Firestore's `experts` collection are experts.
* New skill (`#new-skill`): upload a PDF (up to 10 MB) or paste a procedure (up to
  50,000 characters), and Gemini (`gemini-3.5-flash-lite`, in the cloud) turns it into
  a list of steps to review. Try a sample fills in the demo skill's procedure as
  text, to try it without a document of your own. Save skill stores the skill and its steps in Firestore
  and opens its coach. Saved skills cannot be edited or deleted yet.
* The capture test page (`#capture-test`): a live camera preview, a question box and
  a Capture button. Each capture sends the frame and your question to Gemini and
  shows the answer, whether it came from the device or the cloud, and how long it
  took. It is used for measurements and is not linked from home.

## Run it locally

You need Node 24.12 or newer, Java 21 and Chrome on a desktop computer. On a Mac,
install Java 21 with `brew install --cask temurin@21`. Surtrix's scripts pick Java 21
for their own commands, so other projects keep their Java.

```
npm install
npm run dev:local
```

`npm run dev:local` starts the Firestore and Auth emulators, writes the demo skill
into the Firestore emulator, and starts the dev server; Ctrl+C stops both. To run them separately, use `npm run emulators` in one
terminal and `npm run dev` in another. Open http://localhost:5173 in Chrome. The
Emulator UI is at http://localhost:4000.

Local development never touches the real database or user accounts: Firestore and
Auth always go to the emulators. Gemini and App Check still use the real project.

### Settings in `.env.local`

`.env.local` sits in the project folder and is never committed.

* `VITE_APPCHECK_DEBUG_TOKEN`: the App Check debug token registered for local
  development. Ask a project owner for it. Without it, Chrome prints a new token in
  the DevTools console, and Gemini requests from localhost are refused until a
  project owner registers it in the Firebase console (Security, App Check, Apps tab,
  the `surtrix-web` menu, Manage debug tokens).
* `SURTRIX_WORKTREE`: 1, 2 or 3. Each git worktree that runs at the same time sets
  its own number, so their servers never share a port. Leave it out in the main
  folder (it counts as 1).

| `SURTRIX_WORKTREE` | Dev server | Firestore | Auth | Emulator UI | Hub | Logging | Tests' Firestore |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (default) | 5173 | 8080 | 9099 | 4000 | 4400 | 4500 | 8180 |
| 2 | 5174 | 8081 | 9100 | 4001 | 4401 | 4501 | 8181 |
| 3 | 5175 | 8082 | 9101 | 4002 | 4402 | 4502 | 8182 |

The dev server stops with an error if its port is busy, because the Firebase web key
only accepts requests from localhost 5173 to 5175.

To try a capture, open http://localhost:5173/#capture-test, click Start camera,
allow camera access, type a question and click Capture.

### The demo skill

`scripts/seedDemoSkill.ts` writes the demo skill (`src/demoSkill.ts`) as
`skills/sample-led` with steps `step-1` to `step-4`, and 3 saved expert answers from
the Surtrix team for common beginner mistakes on steps 2 and 4. `npm run dev:local` runs it
against the emulator. With `npm run emulators` and `npm run dev` in separate
terminals, run it once the emulators are up, with `.env.local` so it finds this
worktree's emulator:

```
node --env-file-if-exists=.env.local scripts/seedDemoSkill.ts emulator
```

To write it to the real Firestore (shared by staging and the
live site), run it with an access token of a project owner:

```
GOOGLE_ACCESS_TOKEN="$(gcloud auth print-access-token --account <owner account>)" node scripts/seedDemoSkill.ts real
```

Running it again rewrites only those documents and keeps any other answers stored
under the steps. Questions and expert answers point at these ids, so they never change.

### Clearing test data

Staging and the live site share one database, so staging checks leave test skills,
questions, saved answers and anonymous learners behind. `scripts/cleanupTestData.ts`
lists them and, only with `--delete`, deletes them. It keeps the demo skill with its
seeded answers, every experts entry and every Google account, and never touches
anything created after its cutoff time:

```
GOOGLE_ACCESS_TOKEN="$(gcloud auth print-access-token --account <owner account>)" node scripts/cleanupTestData.ts real
```

The dry run uses now as the cutoff and prints the command that deletes exactly its list,
with that cutoff as `--before`. Check the list before running it.

### Checks

`npm run check` runs the lint, the typecheck, the production build and the tests.
`npm test` runs only the tests: the Firestore rules tests, against their own
Firestore emulator.

## How hybrid inference is used

All AI calls go through the Firebase AI Logic Web SDK (`firebase/ai`) with the
Gemini Developer API, protected by Firebase App Check with reCAPTCHA Enterprise.

* **Hybrid (on device first, cloud fallback)**, the default, uses
  `InferenceMode.PREFER_ON_DEVICE`. When Chrome's built in Gemini Nano is
  available, the frame and question are answered on the computer itself: private,
  free and quick. When it is not, the SDK falls back to the cloud model.
* **On device only** uses `InferenceMode.ONLY_ON_DEVICE` and only ever answers on
  the computer. It is greyed out where Gemini Nano is not available, and the app
  never sends these questions to the cloud.
* **Cloud only** uses `InferenceMode.ONLY_IN_CLOUD` and always asks the cloud
  model, `gemini-4-hydrogen` with low thinking.
* Every answer shows which path produced it, read from the response's
  `inferenceSource`, and the response time in milliseconds.

In the coach the device watches and the cloud judges: Gemini Nano checks camera
frames on device (which of the step's parts are visible, is the LED lit), and the
cloud model checks the wiring when a step is marked done.

## The Firebase web key

`src/firebase-config.ts` contains the Firebase web API key. It is public by design:
every visitor's browser receives it, and it is not a secret. It is protected by
key restrictions (it only works from the Surtrix sites and localhost 5173 to 5175,
and only for the Firebase services the app uses: App Check, AI Logic, Firestore and
Authentication) and by App Check, which refuses requests that do not come from the
real app.

## License

Apache 2.0, see [LICENSE](LICENSE).
