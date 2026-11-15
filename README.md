# Surtrix

Surtrix is an AI bench coach for hands-on electronics work. You upload a procedure
(a manual, SOP or guide), point a camera at your bench, and Surtrix guides you step
by step, catches mistakes, and calls a live human expert when the AI is unsure.
Expert answers are saved to the skill and reused, including offline.

Built for the Google #BuildHybridAI 2026 hackathon.

The app today has these screens:

* Home lists the skills. For now that is one built in sample: lighting an LED with a
  resistor on a breadboard.
* The coach (`#coach/{skill id}`) walks you through a skill one step at a time, next
  to a live camera preview. You move with Back and Next, and Mark step done moves on
  to the next step. It does not use AI yet.
* The capture test page (`#capture-test`): a live camera preview, a question box and
  a Capture button. Each capture sends the frame and your question to Gemini and
  shows the answer, whether it came from the device or the cloud, and how long it
  took. It is used for measurements and is not linked from the app.

## Run it locally

You need Node 24.12 or newer, Java 21 and Chrome on a desktop computer. On a Mac,
install Java 21 with `brew install --cask temurin@21`. Surtrix's scripts pick Java 21
for their own commands, so other projects keep their Java.

```
npm install
npm run dev:local
```

`npm run dev:local` starts the Firestore and Auth emulators and the dev server
together; Ctrl+C stops both. To run them separately, use `npm run emulators` in one
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

In the full app the device watches and the cloud judges: Gemini Nano checks camera
frames every few seconds (which parts are visible, is the LED lit, did the board
change), and the cloud model checks the wiring when a step is marked done.

## The Firebase web key

`src/firebase-config.ts` contains the Firebase web API key. It is public by design:
every visitor's browser receives it, and it is not a secret. It is protected by
key restrictions (it only works from the Surtrix sites and localhost 5173 to 5175,
and only for the Firebase services the app uses: App Check, AI Logic, Firestore and
Authentication) and by App Check, which refuses requests that do not come from the
real app.

## License

Apache 2.0, see [LICENSE](LICENSE).
