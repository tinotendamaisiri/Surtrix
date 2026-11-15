# CLAUDE.md

Guidance for Claude Code (and people) working in this repository. See README.md to run it.

Surtrix is Tinotenda Maisiri's entry for the Google #BuildHybridAI 2026 hackathon
(Devpost, due Nov 30, 2026, 5 PM ET). It is unrelated to the old Cosynced repo that
was also called "Surtrix".

## Product

Surtrix is an AI bench coach for hands-on electronics work. The user uploads a
procedure (manual, SOP, guide), points a camera at their bench, and Surtrix guides
them step by step, catches mistakes, and calls a live human expert when the AI is
unsure. Expert answers are saved to the skill and reused, including offline.

## Hackathon rules (never break)

1. ALL AI inference goes through the Firebase AI Logic Web SDK (`firebase/ai`). No
   direct calls to any other model API, no Gemini REST calls, no other LLM SDKs.
2. Use Firebase AI Logic hybrid inference: on-device Gemini Nano in Chrome with
   cloud Gemini fallback, using `InferenceMode`. Show which path answered
   (`inferenceSource`) in the UI.
3. App Check is required: `ReCaptchaEnterpriseProvider` with site key
   `6LfffCAuAAAAAAyDJlOQ5O_fBna0fCd_Y9rvp3K7`. In local dev, enable the App Check
   debug token and print it so Tino can register it.
4. Firebase project id: `surtrix-50d22`. Web config in `src/firebase-config.ts`. No
   production secrets, service account keys or personal data in the repo.
5. Public repo, Apache 2.0 license. App and all text in English.
6. Before using any Firebase AI Logic API, check the current docs
   (firebase.google.com/docs/ai-logic/hybrid and the web get started page). Do not
   rely on memory. Use Firebase agent skills if available.
7. Nothing merges into main after Nov 30, 2026, 5 PM ET. Commits after the deadline
   are not judged.

## Hard rule: no em dashes or en dashes

Never use an em dash or an en dash anywhere: UI copy, README, comments, docs,
issues, PRs, commit messages, error strings, seed data. Do not use a hyphen as
punctuation either. Use a comma, a colon, a period, or rewrite the sentence. For
ranges write "3 to 30". Dashes in identifiers, URLs, package names and third party
content are not covered. User-facing copy stays plain and does not explain
internals.

## Architecture (target)

* Vite + React + TypeScript on Firebase Hosting.
* Firebase: AI Logic (Gemini Developer API backend), App Check, Firestore, Auth
  (Anonymous for learners, Google for experts), Hosting (live site plus a separate
  staging site).
* On-device Nano: every 2 to 3 seconds, check a camera frame: which parts are
  visible, is the LED lit, did the board change.
* Cloud Gemini, low thinking, with one model per job:
  * `gemini-4-hydrogen` is used ONLY for the wiring judgment: when a step is
    marked done, judge the wiring against the step and say exactly what to move.
  * Every other cloud task uses `gemini-3.5-flash-lite`: converting an uploaded
    procedure into a JSON step list (structured output), simple questions, and
    anything else that is not the wiring judgment.
  * Why (measured Nov 15, #5): on the Nov 12 wiring photo, hydrogen caught the
    mistake with the right fix 4 of 4 times in 3.3 to 5.5 s; flash-lite took 1.2
    to 2.0 s but was fully right only 3 of 5. On the free tier hydrogen was
    limited to 20 requests per day, counted per model; on Blaze (since Nov 15)
    its limits are not published, so hydrogen is still kept for the one job that
    needs it.
* Expert escalation: when the cloud model is unsure or the user taps Ask an Expert,
  write a question to Firestore with the frame, step and question. Expert dashboard
  (Google sign in) lists open questions; the expert replies; the answer is saved to
  the skill.
* Offline: on-device Nano gets saved expert answers for the current step and picks
  the one that applies.
* Firestore (draft): `skills`, `skills/{id}/steps`, `questions`, `answers`,
  `experts`.

## Proven facts (tested Nov 12 and 15)

* Cloud Gemini caught a real breadboard wiring mistake in about 7 s with low
  thinking.
* Gemini Nano in Chrome on Tino's Mac: image input available, about 3.3 s per
  answer, 8.5 s model load. Correct on parts and LED state, missed the wiring
  mistake. So: device watches, cloud judges.
* Nov 15, staging: Gemini Nano described an LED that was not in the frame when the
  question assumed one; the cloud model rejected the same false premise. Every
  question sent to the device model must be neutral and must not assume what is
  in the frame.

## How work starts

* Before any work, run `git fetch` and compare the local branch with
  `origin/staging` and `origin/main`. If anything is behind, say so and pull first.
  Never build on an old copy.
* Every feature or fix starts as a GitHub issue. No issue, no work: stop and offer
  to create one, and wait for Tino's OK.
* Grill before building. When Tino asks to start an issue: check the repo is up to
  date, then run the grilling skill on that issue before cutting a branch or
  changing code. Look up facts yourself; put every decision to Tino with a
  recommendation. Do not start until Tino confirms a shared understanding. Then
  show the issue text updated with what was settled (How to fix it, How to check it
  is fixed), update the issue on Tino's OK, and only then cut the branch. If the
  update only restates answers Tino already gave, update the issue and continue
  without asking.
* State what you will do before doing it. Stop at scope boundaries; add nothing
  that is not in scope. Do not implement future work early, and do not build
  abstractions for hypothetical needs.
* Before any change, report its blast radius: everything it touches beyond the
  thing named. Fix what is plainly part of the same change; ask only where a real
  decision is needed. Never silently change something unnamed or leave something
  broken.
* Do not invent product decisions or silently change architecture. If a
  requirement is ambiguous in a way that affects architecture, data, rules or UX,
  ask first.
* Say what you proved versus what you inferred. Never conflate them.
* Simpler is better. Never rebuild working code. Keep simple features simple and
  finish them fast. Name files, functions, components and Firestore objects with
  the product's own terms.
* Time estimates cover the whole remaining job, not one piece.
* Triage skips blocked issues: leave out every issue labelled `blocked`.
* Unattended runs never ask or wait; log anything that needs Tino under
  "Needs Tino" in `~/Desktop/Surtrix-needs-tino.md` (outside the repo).

## Issues

* Before creating an issue, show Tino the full text, propose its label, and ask who
  to assign it to. Never assign on your own. Create it only on Tino's OK.
* Plain English, no jargon. Describe the behaviour wanted, not old code. These
  sections, in this order:
  * Title: short, says the problem or the outcome, not the fix.
  * Assigned to: the GitHub username Tino chose.
  * How it behaves now: what actually happens today, with the file names, URLs,
    dates or numbers that prove it. Say "unknown, needs checking" rather than
    guessing.
  * Why this is bad: the effect on learners, experts, judges, the team or the
    project.
  * How to fix it: the change to make, specific enough to start from, including
    any rule the fix must keep for the future.
  * How to check it is fixed: observable checks someone can run, including
    `npm run check` and a real look at staging where it applies.
* Exactly one label for the kind of work: `bug`, `enhancement`, `documentation`,
  `security` (vulnerabilities, keys, auth) or `infrastructure` (deploys, Hosting,
  environments, service setup). If `security` or `infrastructure` does not exist
  yet, create it with a short description. Do not use the status labels for this.

## Branches, commits and pull requests

* One branch per issue, named after it (for example `1-scaffold-app`), cut from the
  latest `origin/staging`, with a pull request into `staging`.
* Commit author: Tinotenda Maisiri, with the GitHub noreply address set in this
  repo's git config. Commit or push only as part of an agreed issue.
* Never push anything to GitHub with Claude as author or co-author: no
  Co-Authored-By trailers, no "Generated with Claude Code" lines, and no Claude
  credit in commits, pull requests, issues or comments. Check before every push.
* Never write "Closes #N" or "Fixes #N". Never put close, closes, closed, fix,
  fixes, fixed, resolve, resolves or resolved directly before #N anywhere in a PR
  or commit. Write "Part of #N" and nothing more about closing. An issue is closed
  by hand, with a comment, once its release is deployed and checked.
* After opening a PR, switch the local repo back to main. Once it is merged, pull
  main, delete the work branch locally and on GitHub, and remove its worktree.

## Checks and tests

* Run `npm run check` before every commit.
* Save test output before reading it: write the full, unfiltered output of
  `npm run check` or any test command to a file outside the repo, then filter
  from that file, and give the file's path in the report.
* A test must be able to fail. Report test runs by their counts.
* Never spend cloud model credit just to test a change: ask first. Small test
  calls that an issue's own verification needs are pre-approved; ask for anything
  larger. Typecheck, tests and on-device inference are free.
* Develop and check locally first: Firebase emulators for Firestore and Auth where
  possible; AI Logic runs against the real project.
* Install scripts are allowed one by one: every dependency with an install script
  is listed in `package.json`, allowed or denied, by name. A new one goes in with
  the PR that adds the dependency, on purpose. Never allow all scripts.

## Review

Code review happens in a fresh Claude Code session, never the one that wrote the
code. Right after opening a PR, run this in the repo folder (replace N):

```
claude -p "Review PR #N against its linked issue: logic errors, missed edge cases, security problems, and changes beyond what the issue asks for. Post findings as one PR comment. Change nothing." --allowedTools "Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh issue view:*),Bash(gh pr comment:*),Read,Grep,Glob"
```

Report the findings to Tino. If anything blocks, fix it on the same branch and run
the review again before saying the PR is ready.

## Merging

Claude may merge a pull request into `staging`, using a merge commit, only when all
of these hold:

* Claude opened it in its current session;
* the full local `npm run check` has passed, and the PR's GitHub check has also
  finished and passed (never merge while it is pending);
* any review that ran has no open blocking findings.

Claude never merges into `main`. Release PRs from `staging` into `main` are opened,
reported, and left for Tino to merge.

## Deploys and verification

* Firebase CLI: Tino logs in with the Google account that owns `surtrix-50d22`,
  never the Cosynced account. Always pass `--project surtrix-50d22` explicitly, and
  confirm the active account and project before any deploy.
* `staging` deploys to the staging Hosting site; `main` deploys to the live site
  (surtrix.com). Batch changes; do not deploy every small change.
* Verify on the deployed staging site by reading actual Firestore documents and
  real model responses, not just local output or tests. Read the record, not the
  rendered screen.

## Firebase web key

* The Firebase web key in `src/firebase-config.ts` is public by design. It is
  limited to the Surtrix sites (surtrix.com, the live and staging `web.app` and
  `firebaseapp.com` addresses, and `http://localhost:5173`) and to the APIs the app
  calls, and the APIs behind it are protected by App Check. Never rotate or delete
  it without Tino.
* Any issue that adds a Firebase product adds that product's APIs to the key's API
  restrictions in the same issue, and verifies them locally. For example Firestore:
  `firestore.googleapis.com`; Auth: `identitytoolkit.googleapis.com` and
  `securetoken.googleapis.com`. Check the Firebase API keys docs table for the full
  list at the time. Otherwise the new product fails with a blocked key error.
* Never add the Generative Language API (Gemini Developer API) to this key.
* A new site or domain that serves the app goes on both this key's referrers and
  the reCAPTCHA key's domains.
* Change the key with gcloud as the account that owns `surtrix-50d22`, never the
  Cosynced account, with `--account` and `--project surtrix-50d22` on every command.

## Billing and quotas

* `surtrix-50d22` is on the Blaze plan (since Nov 15). Budget: $5 per month, with
  alerts at 50, 90 and 100 percent.
* Spend caps of $5 each on the Gemini Developer API (AI Logic), Agent Platform
  API, Cloud Run (App Hosting) and Cloud Run Functions. When a cap is reached, that
  service pauses for the rest of the month. A 403 from AI Logic, or AI Logic
  paused, may mean the cap was hit: check billing before debugging code.
* The Gemini API is on Prepay: Tino bought $5 of credit on Nov 15, with auto
  reload off. The credit balance shows only in AI Studio, not in API responses.
  Errors seen or documented so far:
  * 429 "Your prepayment credits are depleted": the credit ran out. Calls fail
    until Tino tops up in AI Studio; log it under Needs Tino.
  * 429 naming `generate_content_free_tier_requests`: a free tier limit (seen Nov
    15 as 20 hydrogen requests per day).
  * 429 `RESOURCE_EXHAUSTED` from the Tier 1 spend limit, $10 per rolling 10
    minutes (documented, not seen yet).
  These are usually billing or quota stops, but a bug that sends too many cloud
  calls causes the same errors, so check the call count too.
* Buying credits and changing billing, budgets or caps are Tino's to do. Report
  the exact error and log it under Needs Tino.

## No dead weight

* Only files the app needs to build and run go in the repo: no scratch files,
  drafts, screenshots, exports, notes or helper folders. Anything made alongside a
  change but not needed by the app stays outside the repo.
* Never delete anything not created in the current session: branches, issues,
  labels, files or settings made by someone else, or made earlier. If something
  looks stale, list it for Tino and leave it.
