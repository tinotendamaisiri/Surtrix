# Surtrix

Surtrix is an AI bench coach for hands-on electronics work. You upload a procedure
(a manual, SOP or guide), point a camera at your bench, and Surtrix guides you step
by step, catches mistakes, and calls a live human expert when the AI is unsure.
Expert answers are saved to the skill and reused, including offline.

Built for the Google #BuildHybridAI 2026 hackathon.

The app today is a capture test page: a live camera preview, a question box and a
Capture button. Each capture sends the frame and your question to Gemini and shows
the answer, whether it came from the device or the cloud, and how long it took.

## Run it locally

You need Node 24 and Chrome on a desktop computer.

```
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173) in Chrome.

The first time, Chrome prints an App Check debug token in the DevTools console. A
project owner registers it in the Firebase console (Security, App Check, Apps tab,
the `surtrix-web` menu, Manage debug tokens). Until then, Gemini requests from
localhost are refused.

Click Start camera, allow camera access, type a question and click Capture.

`npm run check` runs the lint, the typecheck and the production build.

## How hybrid inference is used

All AI calls go through the Firebase AI Logic Web SDK (`firebase/ai`) with the
Gemini Developer API, protected by Firebase App Check with reCAPTCHA Enterprise.

* **Prefer on device** (the default) uses `InferenceMode.PREFER_ON_DEVICE`. When
  Chrome's built in Gemini Nano is available, the frame and question are answered
  on the computer itself: private, free and quick. When it is not, the SDK falls
  back to the cloud model.
* **Cloud only** uses `InferenceMode.ONLY_IN_CLOUD` and always asks the cloud
  model, `gemini-4-hydrogen` with low thinking.
* Every answer shows which path produced it, read from the response's
  `inferenceSource`, and the response time in milliseconds.

In the full app the device watches and the cloud judges: Gemini Nano checks camera
frames every few seconds (which parts are visible, is the LED lit, did the board
change), and the cloud model checks the wiring when a step is marked done.

## License

Apache 2.0, see [LICENSE](LICENSE).
