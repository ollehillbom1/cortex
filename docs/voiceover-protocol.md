# VoiceOver walkthrough protocol (iOS)

A scripted manual test for one person with one iPhone: about 35 minutes of
actual testing after a 10-minute one-off setup, and worth running even if you
stop a third of the way in.

It exists because CI cannot do this job: `@axe-core/playwright` runs Chromium-only
(`playwright.config.ts:26-29`) against seven static surfaces, so nothing in
CI has ever exercised Safari, VoiceOver, or any screen where a timer is
running. `docs/accessibility.md` ("Still open") records that gap; this
protocol is how it gets closed, and its output belongs back in that file.

**What this measures:** whether a person using VoiceOver can complete real
tasks — train, review progress, change preferences — not whether the markup
validates. Judge every step by _"could someone who cannot see the screen
finish this without help?"_, not by whether the wording matches the "Should"
line exactly. Different wording is fine. Missing information is not.

## Order, and why

The scenarios are ordered by expected defect yield, not by user journey, so
that a run that stops after 15 minutes is still worth reading. The timed
session comes first because it is the only part of the app that no automated
check touches and the only part where a defect makes a task _impossible_
rather than annoying. Onboarding comes last because axe-core already scans
it on every CI run and it holds still while you read it.

| #   | Scenario                            | Time  | Why here                                   |
| --- | ----------------------------------- | ----- | ------------------------------------------ |
| 1   | Sound Span, start to first answer   | 8 min | The flagship non-visual path; untested     |
| 2   | Round feedback and auto-advance     | 4 min | 1800 ms timer, no live region              |
| 3   | Session summary                     | 3 min | Where results live; a phase swap, untested |
| 4   | Quit dialog (focus trap, dismissal) | 3 min | Focus behaviour is JS, not markup          |
| 5   | Profile toggles and sliders         | 5 min | Hidden checkboxes behind styled spans      |
| 6   | N-Back (timed visuospatial)         | 5 min | Known-weak; needs measurement, not news    |
| 7   | Tab bar, landmarks, Today           | 4 min | Cheap, and one suspected markup bug        |
| 8   | Stats charts (SVG)                  | 3 min | Chart updates may be silent                |
| 9   | Onboarding and profile picker       | 5 min | Stretch; needs a second profile            |

Scenarios 1 and 2 run as one continuous session and must be **played to the
end** — all four rounds. A block is only recorded once its final round
finishes (`SessionRunner.tsx`, `advance()` returns early while
`roundIndex + 1 < currentItem.rounds`), and a session with no completed block
saves nothing at all. Finishing scenarios 1-2 is therefore what gives scenario
8 (Stats) something to look at, and it is the only way to reach the summary
screen in scenario 3.

Scenario 4 then starts a _second_, throwaway session purely to open the quit
dialog. Do not try to combine the two: quitting mid-block leaves no history.

---

## Setup (once, before the clock starts)

### S1. Install the app to the home screen

The PWA needs a secure context: HTTPS or `http://localhost`. A dev server on
`http://192.168.x.x` will not install and will not register a service worker
— use the deployed instance or a local CA as described in
`docs/deployment.md` ("HTTPS and reverse proxy").

1. Open the app in **Safari** (not Chrome — the install path differs).
2. Share button → **Add to Home Screen** → Add.
3. Launch it from the home screen icon. Confirm there is no Safari address
   bar. **Run the whole protocol from this standalone window.** Standalone
   mode removes the browser back button, which changes what "dismiss" means
   in scenario 4.

### S2. iOS settings

- **Settings → Accessibility → Accessibility Shortcut → VoiceOver.** Triple-
  click the side button to toggle VoiceOver. Non-negotiable: you will need
  to switch it off mid-test to write notes.
- **Settings → Accessibility → VoiceOver → Caption Panel → On.** This prints
  everything VoiceOver says as text at the bottom of the screen. It is what
  makes verbatim reporting possible for a sighted tester, and it makes
  screen recordings readable. Note that it overlays the bottom of the
  screen, including the tab bar.
- **VoiceOver → Verbosity → Punctuation → Some** (the default). Scenario 5
  depends on this setting; do not change it until told to.
- **VoiceOver → Verbosity → Speak Hints → On.**
- **VoiceOver → Audio → Audio Ducking → On.** The app speaks digits through
  `SpeechSynthesis`, the same engine VoiceOver uses; ducking is part of what
  we are testing.
- **VoiceOver → Rotor:** enable Headings, Links, Form Controls, Landmarks,
  Containers, and Words.
- **Focus / Do Not Disturb → On**, so notifications do not pollute the
  transcript.
- **Ring/silent switch off silent**, volume around 50%. Web Audio and speech
  follow the hardware switch in Safari.
- Leave **Reduce Motion** at your normal setting and note which it is.
- **Pin the language, and record it.** Cortex follows the device language
  unless a profile overrides it: a Swedish-configured iPhone switches every
  string in this document to Swedish _and_ makes the app speak digits with a
  Swedish voice (`resolveLocale` / `speechLang` in `src/lib/i18n/index.ts`).
  That second effect sits directly on top of the contention test in 1.7, so
  note all three: device language, app language (Profile → Language), and
  VoiceOver's own speech language. If they differ, say so in every finding —
  it changes what "correct" sounds like.

### S3. App state

- If this is a fresh install you will land on `/welcome`. Create a profile
  named something obvious like "VO test" — and record the two checks in S4
  while you are there, because you only see onboarding once.
- If a profile already exists, go to **Profile → Preferences** and confirm:
  **Sound = on**, **Skip exercises that need sight = off**, **Larger text =
  off**, **Kid mode = off**. Scenarios 1 and 6 assume these.
- A brand-new profile starts every exercise at level 1. All timings quoted
  below are level-1 timings.

### S4. Onboarding, if you see it (record now, audit later in scenario 9)

- [ ] **S4a** With VoiceOver on, two-finger swipe up on the first welcome
      screen to read from the top.
      _Should:_ the step indicator reports position ("Step 1 of 4"), then the
      heading, then the body text, then "Get started, button".
      _Heard:_
- [ ] **S4b** On the profile form, swipe to the name field and the avatar
      choices.
      _Should:_ "Your name, text field"; the ten avatars announce as radio
      buttons with a selected state (the first is a brain emoji, so something
      like "brain, selected, radio button, 1 of 10").
      _Heard:_

### S5. Recording

Screen recording on iOS does **not** reliably capture VoiceOver speech. Two
options that do work:

- The Caption Panel plus a normal screen recording (you read the transcript
  off the video), or
- a second device recording audio in the room, with VoiceOver on the speaker.

For timed screens (scenarios 1, 2, 6) record something. Prose written after
the fact will not survive a 46-second stream of stimuli.

### S6. Gestures used in this protocol

| Gesture                 | Effect                                     |
| ----------------------- | ------------------------------------------ |
| Swipe right / left      | Next / previous element                    |
| Double-tap              | Activate the focused element               |
| Single-finger touch     | Speak whatever is under your finger        |
| Two-finger swipe up     | Read everything from the top of the screen |
| Two-finger swipe down   | Read everything from the current position  |
| Two-finger tap          | Pause / resume speech                      |
| Two-finger scrub ("Z")  | Back / dismiss                             |
| Three-finger swipe up   | Scroll down one screen                     |
| Two-finger rotate       | Change rotor setting                       |
| Swipe up / down         | Adjust the focused value (sliders, rotor)  |
| Three-finger triple-tap | Screen curtain on / off                    |
| Two-finger triple-tap   | Item Chooser (lists everything on screen)  |
| Three-finger double-tap | Mute / unmute VoiceOver speech             |

**Screen curtain is the single most useful tool here.** Scenarios 1, 2 and 6
say when to turn it on. A sighted tester who leaves it off will
unconsciously compensate and record a pass where a blind user hits a wall.

---

## Scenario 1 — Sound Span, start to first answer (8 min)

Sound Span (`auditory-digits`) is the exercise the accessibility docs point
at as the non-visual counterpart to Number Span. If anything in the app is
supposed to work by ear alone, this is it.

At level 1 a block is **4 rounds of 3 spoken digits** (`numberSpanParams`:
span is `3 + floor((level-1)/2)`, so 3 at level 1 — 4 is the number of
rounds, not the number of digits). Play all four rounds.

Route: **Train tab → Sound Span**, which navigates to
`/session?exercise=auditory-digits`.

- [ ] **1.1** From the Today screen, find and activate the **Train** tab.
      _Should:_ the tab announces itself as a link/button named "Train",
      then the exercise library loads and VoiceOver says _something_ that
      tells you the screen changed.
      _Heard:_
- [ ] **1.2** Swipe right until you reach **Sound Span**, then double-tap.
      _Should:_ one element per exercise, named, including its sensory
      requirement ("needs sound"). After activating: the instructions screen
      is announced, and the VoiceOver cursor is somewhere sensible — ideally
      on the "Sound Span" heading, not stranded on the old page.
      _Heard:_
      _Where did the cursor land? (touch the top-left corner, then swipe
      right once to find out):_
- [ ] **1.3** Two-finger swipe up to read the instructions screen from the
      top.
      _Should:_ "Exercise 1 of 1", heading "Sound Span", tagline, "Level 1 ·
      4 rounds", "How it works" with its bullet list, the scoring line, the
      accessibility note, and "Start Sound Span, button". The progress bar
      and "End session, button" in the header should also be reachable.
      _Heard (note anything missing or read out of order):_
- [ ] **1.4** **Turn on screen curtain now** (three-finger triple-tap).
      Everything from here to step 1.9 is done blind.
- [ ] **1.5** Activate **Start Sound Span**.
      _Should:_ the play screen announces the round ("Sound Span, round 1 of
      4") and the status line "Sound on? Tap play when you are ready to
      listen." — without you having to hunt for it.
      _Heard:_
      _Did anything at all speak after activation? (y/n):_
- [ ] **1.6** Find and activate the play control.
      _Should:_ "Play the audio sequence, button", plus how many digits are
      coming ("3 digits will be spoken.").
      _Heard:_
- [ ] **1.7** Listen. **This is the contention test.**
      _Should:_ every digit is audible and distinguishable.
      _Heard — how many of the digits could you make out?_
      _Did VoiceOver talk over the digits, or the digits over VoiceOver?_
      _Did the status line "Listen to the digits…" interrupt them?_
- [ ] **1.8** After playback, explore the answer area by swiping right from
      the status line.
      _Should:_ you learn (a) that it is your turn, (b) whether the order is
      forward or reverse, (c) how many digits are expected and how many you
      have entered so far.
      _Heard when you reach the entry slots:_
      **Expected weakness E5** — the slots are an unlabelled `<div>`
      (`src/components/game/shared.tsx:109-139`), and empty slots contain a
      transparent character "0". Listen specifically for a run of zeroes.
      _Did you hear zeroes? How many?:_
- [ ] **1.9** Enter the digits on the keypad. Find "5" by touch-exploring,
      then swipe to neighbours.
      _Should:_ keys announce as "1, button" … "9, button", "0, button",
      "Delete last digit, button", "Done, button". After each entry you are
      told what you now have ("Entered 2 of 3 digits" or the digits
      themselves).
      _Heard after entering the first digit:_
      _Heard after entering the last digit (the round auto-submits 150 ms
      later — did anything warn you?):_
- [ ] **1.10** Screen curtain off. Note the wall-clock time you spent on
      round 1 versus the ~24 s the exercise budgets for it.
      _Time taken:_
- [ ] **1.11** Play out rounds 2-4 (sighted is fine now). You need the block
      to finish, or scenarios 3 and 8 have nothing to work with.

**Blocking?** If you could not complete round 1 blind, stop and write that
finding up now — it is the most important result in this document.

---

## Scenario 2 — Round feedback and auto-advance (4 min)

Stay in the same session; you are now between rounds. The feedback
interstitial is rendered by `SessionRunner.tsx` and auto-advances after
**1800 ms** (`SessionRunner.tsx:276-280`). It contains no live region and no
focus move, so the prediction is silence followed by a round that has
already started.

- [ ] **2.1** After submitting a round, **do not touch the screen at all**
      for five seconds. Screen curtain on if you can bear it.
      _Should (ideal):_ the result is announced — "Well done", the accuracy,
      the detail line ("Span 4 · forward") — and you are told the next round
      is starting.
      _Heard, in order, with rough timings:_
      _Total silence in seconds before anything useful was said:_
- [ ] **2.2** After it auto-advances, find out where the VoiceOver cursor
      is: touch the top-left of the screen, then swipe right once.
      _Should:_ the cursor is on the new round's first meaningful element.
      _Actual cursor position:_
- [ ] **2.3** On the next round's feedback, swipe right immediately to look
      for the **Continue** button.
      _Should:_ "Continue, button" is reachable.
      _Heard — and did the screen change under you mid-swipe?:_
      _Could you reach Continue before the 1800 ms timer fired? (y/n):_
- [ ] **2.4** Judgement call, one line: **can a VoiceOver user tell whether
      they got a round right?**
      _Answer:_

---

## Scenario 3 — Session summary (3 min)

You have just finished the Sound Span block, so the runner has swapped to its
summary phase. This is where a user learns what they scored — and it is a
phase swap inside the same route: no navigation, no focus move, no
announcement (**E9**). It is the terminus of every real session and nothing
in CI touches it.

- [ ] **3.1** The moment the last round ends, **do not touch the screen** for
      five seconds.
      _Should:_ you are told the session is over and what you scored.
      _Heard, with rough timings:_
      _Seconds of silence before anything useful:_
- [ ] **3.2** Find out where the VoiceOver cursor is (touch the top-left,
      then swipe right once).
      _Cursor position:_
- [ ] **3.3** Two-finger swipe up to read the summary from the top.
      _Should:_ the "Session complete" heading, accuracy, XP earned, any
      level change, any new personal record or achievement, and the control
      that returns you to Today.
      _Heard — and was anything shown visually that was never spoken?:_
- [ ] **3.4** Activate the finish/continue control.
      _Should:_ you land on Today and are told the screen changed.
      _Heard:_

---

## Scenario 4 — Quit dialog: focus trap and dismissal (3 min)

**Start a second, throwaway session for this** (Train → any exercise →
Start). Do not quit the session from scenario 1: a block that has not
finished its last round saves nothing, and you would lose the history
scenario 8 needs.

The dialog is
`src/components/ui/Dialog.tsx`: it moves focus to the first control on open,
cycles Tab inside itself, closes on Escape or backdrop tap, and restores
focus on close. All of that is keyboard logic; none of it is exercised by
VoiceOver's gestures, which is exactly why this scenario exists.

- [ ] **4.1** Find the end-session control in the header.
      _Should:_ "End session, button" (it is an icon-only button with an
      `aria-label`).
      _Heard:_
- [ ] **4.2** Double-tap it.
      _Should:_ VoiceOver announces a dialog named "End session?" and lands
      on "Keep training, button"; the body text explaining what will be
      saved is reachable.
      _Heard:_
      _Where did the cursor land?:_
- [ ] **4.3** Swipe right repeatedly (6-8 times) past the last button.
      _Should:_ you must **not** reach the game behind the dialog or the tab
      bar. Confinement here comes from `aria-modal="true"`, not from the
      Tab-key trap in `Dialog.tsx` (VoiceOver swipes are not Tab presses), so
      expect the cursor to stop at the dialog boundary rather than cycle back
      to the first button. Reaching content behind the dialog is the finding;
      "it did not wrap around" is not.
      _Did you escape the dialog? What did you reach?:_
- [ ] **4.4** Touch-explore the top third of the screen, outside the dialog
      panel.
      _Should:_ nothing behind the dialog speaks (`aria-modal="true"`).
      _Heard:_
- [ ] **4.5** Two-finger scrub (Z) to dismiss.
      _Should:_ the dialog closes and you are back in the session.
      _Actual — did it close, do nothing, or navigate away entirely?:_
      (The dialog listens for the Escape **key**. Whether Safari turns a
      scrub into an Escape keydown for web content is the open question; a
      scrub that leaves the session instead of closing the dialog is a real
      finding.)
- [ ] **4.6** Reopen the dialog, then activate **Keep training**.
      _Should:_ focus returns to the "End session" button you came from.
      _Where did the cursor go?:_
- [ ] **4.7** Reopen it once more and activate **End session**.
      _Should:_ you land on Today, and VoiceOver tells you the screen
      changed.
      _Heard:_

---

## Scenario 5 — Profile toggles and sliders (5 min)

Preferences use a `Toggle` whose real control is a visually hidden checkbox
inside a wrapping `<label>`, with the visible track drawn by sibling
`<span>`s (see `Toggle` at the foot of `src/app/(tabs)/profile/page.tsx`).
This pattern passes axe-core and still fails in practice when the accessible
name lands on the wrong node or the state change is never announced.

A fresh install with one profile and no coach endpoint shows **five**
toggles: Sound, Larger text, Reduce motion, Skip exercises that need sight,
Kid mode. Two more appear conditionally — "Ask who's training at start" only
with a second profile, "AI phrasing of insights" only when the server has a
coach configured — so do not treat any particular count as a target.

Go to the **Profile** tab.

- [ ] **5.1** Set the rotor to **Form Controls** (two-finger rotate), then
      swipe down repeatedly to walk the controls.
      _Should:_ you reach every toggle and both sliders; each stop has a
      name.
      _List every control you reached, in order (the list is the result — do
      not check it against an expected count). Any unnamed ("checkbox" with
      no label) stops?:_
- [ ] **5.2** Set the rotor back to Characters/Words and swipe right to the
      **Sound** toggle.
      _Should:_ one stop that carries all three parts — name ("Sound"),
      description ("Tones and spoken digits during exercises"), role and
      state ("checkbox, checked" or "switch, on").
      _Heard — and was it one stop or several?:_
- [ ] **5.3** Double-tap it.
      _Should:_ VoiceOver immediately says the new state ("unchecked" /
      "off").
      _Heard:_
      _If nothing was announced: swipe left then right back onto it — does
      it report the new state now?:_
- [ ] **5.4** With Sound off, swipe to the **Volume** slider.
      _Should:_ "Volume, adjustable, 80 percent" (the default) _and_
      "dimmed" — it is disabled while sound is off.
      _Heard:_
- [ ] **5.5** Turn Sound back on. On **Volume**, swipe up and down to change
      the value.
      _Should:_ each change announces the new percentage.
      _Heard:_
- [ ] **5.6** Same on **Daily goal**.
      _Should:_ "Daily goal in minutes, adjustable, 10"; values step by 5.
      _Heard:_
- [ ] **5.7** Toggle **Larger text** on.
      _Should:_ the change is announced, and the VoiceOver cursor stays on
      the toggle rather than being thrown to the top of the reflowed page.
      _Heard / where did the cursor go?:_ (turn it back off)
- [ ] **5.8** Swipe to **Skip exercises that need sight**.
      _Should:_ its long description is announced, or is available as a
      hint.
      _Heard — was the description read in full, truncated, or skipped?:_
- [ ] **5.9** Find the destructive controls (export, import, reset, delete)
      **without activating them**.
      _Should:_ each is clearly named, and the dangerous ones read as
      distinct from the safe ones.
      _Heard:_

---

## Scenario 6 — N-Back, a timed visuospatial exercise (5 min)

**Read this before you start: most of this scenario is expected to fail.**
The stimulus in N-Back is the position of a lit square in a 3×3 grid, and
the nine tiles are plain `<div>`s with no role, no name and no live region
(`src/components/game/NBackGame.tsx:99-115`). There is no honest way to
render "top-left flashed for 700 ms" through a screen reader, which is why
the exercise is labelled as requiring sight rather than pretending
otherwise (`docs/accessibility.md`, "Sensory requirements are labelled").

So do **not** file nine bugs here. File at most one, and make it a
measurement. What we do not know, and what this scenario is for:

- exactly what a VoiceOver user hears during those 46 seconds,
- how badly the status line's polite live region floods the channel,
- whether the **Match** button and its feedback are usable at all,
- whether the round can be exited cleanly when a user realises they are
  stuck.

At level 1 the round is 17 stimuli at 2.7 s each, roughly 46 s, with no
pause, no extend and no way to slow it down. The status line
(`PhaseHint`, `src/components/game/shared.tsx:35-44`) re-renders on every
stimulus and contains a live counter, so it is expected to fire ~17 times.

Route: **Train tab → N-Back** (if the sight filter is on, use the "Show N
exercises that need sight" button first). One round only.

- [ ] **6.1** Before starting, on the instructions screen: does it tell you
      this exercise needs sight?
      _Heard:_
- [ ] **6.2** Screen curtain on. Start the round. Do not touch anything for
      the first 15 seconds — just listen and let the Caption Panel record.
      _Transcript of the first 15 s (or a count of repeated phrases):_
      _How many times did the status line speak?:_
      _Could you tell, at any point, that a stimulus had appeared? (y/n):_
- [ ] **6.3** Still blind, try to find the **Match** button by touch and
      press it once.
      _Should:_ "Match, button", and after pressing, "Correct match" or
      "Not a match — hold steady" (this one has real text, unlike Dual
      N-Back's bare ✓/✗ glyph).
      _Heard:_
      _Was the feedback cut off by the next status-line update?:_
- [ ] **6.4** Swipe right through the grid area.
      _Should (ideal):_ nine addressable tiles. _Expected:_ the group label
      "N-back position grid" and then nothing — the tiles are not in the
      accessibility tree.
      _How many stops did you get inside the grid?:_
- [ ] **6.5** Screen curtain off. Let the round finish, or quit it.
      _Was quitting mid-round possible with VoiceOver on? (y/n, and how):_
- [ ] **6.6** One sentence for the report: what would make this exercise
      _survivable_ (not necessarily playable) for a VoiceOver user — e.g. an
      up-front "this exercise cannot be played without sight" announcement,
      a quieter status line, or an easier exit?
      _Answer:_

**Optional, 60 s, if time permits:** repeat 5.3 on **Dual N-Back**, whose
per-channel feedback is a lone "✓" or "✗" character in a live region
(`src/components/game/DualNBackGame.tsx:216-219`). Then set **Verbosity →
Punctuation → All** and press again. Record what each setting says. This is
the one place where a punctuation setting changes whether feedback exists.

---

## Scenario 7 — Tab bar, landmarks and the Today screen (4 min)

- [ ] **7.1** Set the rotor to **Landmarks** and swipe down through the
      Today screen.
      _Should:_ a navigation landmark named "Main", the main content, and
      the labelled regions (backup reminder, training insight, level
      progress, today's training, strengths and focus areas, recent
      sessions).
      _What was listed, in order? Any unnamed or duplicated entries?:_
- [ ] **7.2** Rotor to **Headings**, swipe down.
      _Should:_ a sensible heading outline starting at "Cortex".
      _Heard:_
- [ ] **7.3** Touch each of the four tabs along the bottom.
      _Should:_ "Today", "Train", "Stats", "Profile", each identified as a
      link or button, and the active one distinguished somehow (VoiceOver
      may say "current page", or may not — record exactly what you get).
      _Heard for the active tab:_
      _Heard for an inactive tab:_
- [ ] **7.4** Swipe to the streak counter at the top right.
      _Should:_ something like "3 day streak". _Suspected defect:_ it is a
      `<span>` whose only description is a `title` attribute, so it may
      announce as a bare number with no context.
      _Heard:_
- [ ] **7.5** Swipe to the main **Start session** control.
      _Should:_ exactly one stop, "Start session, button" (or link), which
      activates on double-tap. _Suspected defect:_ it is a `<Link>` wrapping
      a `<Button>`, i.e. an `<a>` containing a `<button>`, which can surface
      as two nested stops or as a control that does not navigate.
      _How many stops? Did double-tap navigate?:_
- [ ] **7.6** If a backup reminder or insight card is showing, find its
      dismiss control.
      _Should:_ "Dismiss insight for today, button" — not a bare "×".
      _Heard:_

---

## Scenario 8 — Stats charts (3 min)

Requires history, which scenarios 1-2 produced by finishing the block. Charts are inline SVG
exposed as `role="img"` with a text summary
(`src/components/ui/charts.tsx`); the real question is whether the summary
is enough and whether changing the selection tells you anything.

- [ ] **8.1** Go to **Stats** and two-finger swipe up to read the screen.
      _Should:_ each chart announces as an image with a sentence of content
      ("Accuracy: latest 82, 9 data points, from 61.", "Activity: active on
      3 of the last 28 days.").
      _Heard for each chart — is the sentence enough to know the trend?:_
- [ ] **8.2** Find the exercise chooser above the accuracy chart and swipe
      through it.
      _Should:_ nine buttons, with the current one announced as "selected".
      _Heard:_
- [ ] **8.3** Select a different exercise.
      _Should:_ you are told that the chart changed and what it now says.
      _Suspected defect:_ the chart is not in a live region, so the update
      is silent.
      _Heard after the double-tap:_
      _How many swipes did it take to find out the new value?:_
- [ ] **8.4** Find the training balance section.
      _Should:_ each bar reports its share ("Working memory: 40 percent of
      recent training").
      _Heard:_

---

## Scenario 9 — Onboarding and the profile picker (5 min, stretch)

The launch profile picker (`src/components/app/ProfileGate.tsx:65-70`) is a
hand-rolled `role="dialog" aria-modal` overlay with **no focus move on open,
no Escape handler and no cancel path**. It only appears with two or more
profiles, so you have to create one.

- [ ] **9.1** Profile tab → **Add household profile**, create "VO test 2".
      _Should:_ the creation dialog behaves like scenario 4's dialog —
      announced, focus moved into it, closable.
      _Heard:_
- [ ] **9.2** Fully quit the app (swipe up from the app switcher) and
      relaunch it from the home screen.
      _Should:_ the "Who is training?" picker appears **and is announced**;
      the VoiceOver cursor moves into it.
      _Heard on launch:_
      _Where was the cursor?:_
- [ ] **9.3** Touch-explore behind the picker.
      _Should:_ background content is silent.
      _Heard:_
- [ ] **9.4** Two-finger scrub to dismiss.
      _Should (as designed):_ nothing — there is no cancel. Confirm that a
      user cannot get stuck in a state where the picker is on screen and
      nothing responds.
      _Actual:_
- [ ] **9.5** Pick a profile.
      _Should:_ each profile is one stop with its name; a PIN-protected
      profile says so rather than announcing a lock emoji.
      _Heard:_
- [ ] **9.6** Delete the extra profile afterwards (Profile → the profile →
      delete), and confirm the destructive dialog is announced with its
      warning text.
      _Heard:_

---

## Known-weak areas: what to log, and what not to

These are already understood. Confirming them is useful; twenty separate
issues about them is not. Log each as **one** finding, referenced by its
code below, with the transcript and timings attached — that is the part we
do not have.

| Code | Area                                                                            | Expected behaviour                                                                                               |
| ---- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| E1   | N-Back / Dual N-Back grid (`NBackGame.tsx:99-115`, `DualNBackGame.tsx:184-200`) | Stimulus is absent from the accessibility tree. Exercise unplayable blind, by construction.                      |
| E2   | Sequence / Pattern grids                                                        | Tiles are named buttons ("Tile 5"), but the flashed sequence itself is never announced.                          |
| E3   | Status line (`shared.tsx:35-44`)                                                | Polite live region containing a live counter; fires once per stimulus. Expect flooding.                          |
| E4   | Feedback interstitial (`SessionRunner.tsx:276-280`)                             | 1800 ms auto-advance, no live region, no focus move. Expect silence.                                             |
| E5   | Digit slots (`shared.tsx:109-139`)                                              | `aria-label` on a role-less `<div>`; empty slots contain a transparent "0". Expect zeroes.                       |
| E6   | Dual N-Back channel feedback (`DualNBackGame.tsx:216-219`)                      | Live region whose entire content is "✓" or "✗". May be read as a symbol name, or dropped.                        |
| E7   | Spoken digits (`AuditoryGame`, `DualNBackGame`)                                 | `SpeechSynthesis` competes with VoiceOver for the same engine.                                                   |
| E8   | Profile picker (`ProfileGate.tsx:65-70`)                                        | No focus move on open, no Escape, no cancel.                                                                     |
| E9   | Session phase changes (`SessionRunner`)                                         | Phases swap in place: no route change, no focus management, no announcement.                                     |
| E10  | Docs overclaim (`docs/accessibility.md:10-11`)                                  | Keyboard play is claimed for Sound Span, which has no key handler. Bonus check if you have a Bluetooth keyboard. |

**Anything not on this list is news.** Treat surprises — a control that
cannot be activated, a dialog you can swipe out of, a preference that
changes nothing, a screen where the cursor vanishes — as the primary output
of the run.

---

## Reporting

Open one issue per finding with the `accessibility` label. Findings against
E1-E10 go as comments on the existing issue rather than as new ones.

A report is actionable when it contains all of:

1. **Environment** — iPhone model, iOS version, Safari vs. installed PWA,
   app version/commit, and any VoiceOver setting that differs from the S2
   list (especially Punctuation and Speak Hints).
2. **Where** — the route (`/session?exercise=auditory-digits`), the phase
   (instructions / playing / feedback), and the file if you know it.
3. **The exact gesture sequence** from a known starting point, short enough
   to replay. "Swipe right 4× from the top, double-tap" beats "navigate to
   the button".
4. **Verbatim announcement**, copied from the Caption Panel, in quotes,
   including the punctuation and the order things were said. "It said the
   wrong thing" is not reproducible; `"0, 0, 0, 0"` is.
5. **What should have been said instead**, in one line, phrased as
   information a user needs — not as an implementation ("add
   `aria-live`"), unless the fix is obvious.
6. **Frequency** — every time, or 1 in 3? Timed screens are racy; say which
   you observed and how many attempts.
7. **Severity**, using this scale:
   - **Blocker** — the task cannot be completed without sight or outside
     help.
   - **Major** — completable, but only by guessing, brute force, or memory
     of a previous sighted run.
   - **Minor** — completable; wrong, missing or excessive speech.
   - **Cosmetic** — verbosity or ordering that a habitual user would filter
     out.
8. **A recording** for anything on a timed screen.

Two extra fields worth a line each when relevant: **how long** you were left
in silence, and **where the VoiceOver cursor was** when things went wrong.
Those two facts explain most focus-management bugs on their own.

When the run is done, add a dated summary to `docs/accessibility.md` under
"Still open" — device, iOS version, which scenarios ran, and the counts by
severity — and correct any claim in that file the run contradicts.

## Result log

| Scenario              | Ran? | Blockers | Majors | Minors | Notes |
| --------------------- | ---- | -------- | ------ | ------ | ----- |
| 1 Sound Span          |      |          |        |        |       |
| 2 Round feedback      |      |          |        |        |       |
| 3 Session summary     |      |          |        |        |       |
| 4 Quit dialog         |      |          |        |        |       |
| 5 Profile controls    |      |          |        |        |       |
| 6 N-Back              |      |          |        |        |       |
| 7 Tab bar and Today   |      |          |        |        |       |
| 8 Stats charts        |      |          |        |        |       |
| 9 Onboarding / picker |      |          |        |        |       |

Device language: ......... App language: ......... VoiceOver language: .........

Device: ............... iOS: ......... Build/commit: ...............
Date: ............... Tester: ...............
