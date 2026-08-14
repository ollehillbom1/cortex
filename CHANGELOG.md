# Changelog

## v1.11.2 — 2026-08-14

- fix(audio): recover the Web Audio context after an iOS interruption (#138)

## v1.11.1 — 2026-08-13

- test(apply): close the record + achievement gaps a mutation audit found (#136)
- fix(streak): anchor the streak to the session's start day, not the save time (#135)
- fix(split-second): ignore a double-tap on the ring so a trial isn't skipped (#134)
- fix(session): pause the feedback auto-advance while the quit dialog is open (#133)
- fix(sync): serialise tombstone writes so a concurrent cycle cannot lose one (#132)
- fix(session): persist a completed exercise's skill from its finalized block, not live state (#131)

## v1.11.0 — 2026-08-13

- fix(sync): keep the old backup when the lost-device rotation's push fails (#128)
- test(e2e): filter WebKit's RSC-prefetch pageerror noise from the console net (#129)
- fix(sync): stop reset resurrection and attempts-shrink in profile merge (#127)
- test: add three standing bug-nets — property sweep, console net, monkey walk (#125)
- fix(pwa): disable zoom app-wide, and own the accessibility trade openly (#124)

## v1.10.0 — 2026-08-12

- feat(theme): give every modality a colour, and every exercise its own (#122)
- refactor(theme): route every white-alpha surface through design tokens (#121)

## v1.9.0 — 2026-08-12

- feat(exercises): Split Second — brief exposures at the edge of view (#119)
- feat(exercises): Name Recall — faces, names and the imagery strategy (#118)
- feat(flow): point at tomorrow, recap last week, skip the re-read (#117)
- feat(exercises): Go/No-Go — response inhibition, the first hold-back task (#116)
- feat(nback): open the n ladder (4/5-back) with n-adjacent lures, additively (#115)
- feat(ux): pay the record bonus, surface streak freezes, and cut dead time (#114)
- docs(a11y): descope screen-reader support, and stop overclaiming keyboard play (#113)

## v1.8.0 — 2026-08-11

- fix(deps): pin nanoid and js-yaml past their advisories (CVE-2026-67213, CVE-2026-59870) — both transitive/build-time only, not exploitable in the shipped app, patched anyway
- build(deps): bump the minor-and-patch group with 2 updates (#110)
- feat(a11y): audit the screens players live on, and pin what axe cannot see (#108)
- ci(e2e): bound the job, so a hung runner fails fast instead of blocking (#107)

## v1.7.0 — 2026-08-05

- docs(copy): stop naming IQ in order to deny it (#105)

## v1.6.0 — 2026-08-05

- fix(games): measure the finger, not the click — the tap was the bug (#103)
- fix(pwa): the install hint reached neither iPads nor Android owners (#102)
- docs(public): promote the open source, and stop shipping the address (#101)

## v1.5.0 — 2026-08-05

- feat(welcome): say out loud what the privacy design actually delivers (#99)
- build(deps): bump actions/setup-node from 4.4.0 to 7.0.0 (#79)

## v1.4.0 — 2026-08-05

- feat(pwa): show phone visitors how to put Cortex on the home screen (#97)

## v1.3.0 — 2026-08-05

- feat(sync): retention that warns humans instead of deleting their backup (#95)

## v1.2.0 — 2026-08-05

- ci(e2e): give WebKit one paced retry of only its failures (#93)
- feat(stats): personal records carry their measurement era (#92)

## v1.1.0 — 2026-08-04

- feat(sync): device registry and a guided lost-device flow (ADR 0010 outcome) (#90)
- docs(adr): propose v4 sync — per-device keys, device list, revocation (#89)
- feat(stats): version what a level means, and refuse to plot across a change (#88)

## v1.0.0 — 2026-08-04

- ops(release): prepare releases as a PR, tag only what main actually got (#85)
- ops: backups that are restored, releases that can be rolled back to (#84)
- ops(watchdog): page a human when production breaks (#83)
- build(deps-dev): bump typescript from 5.9.3 to 6.0.3 (#82)
- feat(sync): delete the server copy from the profile, visibly (#81)
- chore(deps): types track the runtime — @types/node to 22, majors ignored (#80)
- build(deps): bump docker/setup-qemu-action from 3.7.0 to 4.2.0 (#71)
- sec(sync): the group id is a locator — writes now require a capability (#78)
- build(deps): bump docker/setup-buildx-action from 3.12.0 to 4.2.0 (#70)
- build(deps): bump actions/upload-artifact from 4.6.2 to 7.0.1 (#73)
- build(deps): bump actions/checkout from 4.4.0 to 7.0.1 (#69)
- build(deps): bump docker/build-push-action from 6.19.2 to 7.3.0 (#68)
- build(deps): bump the minor-and-patch group with 2 updates (#72)
- fix(game): rounds cannot hang, and the level is audible (#77)
- fix(session): backgrounding during feedback no longer scores an unseen round (#67)
- sec(container): hardened runtime by default, in compose and in production (#66)
- sec(supply-chain): pin everything third-party, and gate the pins (#65)
- ci(e2e): promote WebKit from non-blocking to required (#64)
- docs(testing): describe the suite that exists, and gate the claims in CI (#63)
- fix(levels): every step below a ceiling now changes the task (#62)
- fix(stats): show the level trend — the signal accuracy is designed to hide (#61)
- fix(storage): refuse oversized imports unread, and land imports atomically (#60)
- feat(session): the rest of a capped goal becomes the second session's target (#59)
- feat(sync): v3 protocol — random identity, sync code as invite and recovery (#58)
- fix(ci): actually write the report the upload steps exist to preserve (#57)
- fix(e2e): restore the format gate, and record why offline is Chromium-only (#56)
- fix(reaction): stop offering a difficulty that changes nothing (#55)
- fix(e2e): match the hidden-exercises toggle by what it actually says (#54)
- fix(privacy): say what actually happens to the data, and publish the page (#50)
- feat(sync): offer a generated high-entropy passphrase (#45)
- fix(sync): make rejoining an existing sync group findable (#43)
- fix(measurement): time reaction from the painted frame, and stop conflating latency with task length (#51)
- fix(storage): rebuild untrusted records from an allow-list (#49)
- fix(session): backgrounding the app discards the round instead of scoring it (#47)
- fix(levels): stop each exercise where its difficulty stops changing (#48)
- fix(session): commit the session and its progression in one transaction (#40)
- ci: run the e2e suite on WebKit as well, non-blocking to start (#53)
- fix(pwa): cache per build, and precache what a cold start actually needs (#46)
- fix(sync): bound the request body and the store as a whole (#44)
- fix(sync): merge profile progression field by field instead of last-write-wins (#42)
- fix(sync): a progression reset on one device reaches the others (#41)
- fix(storage): never write data from a newer build back down (#39)
- fix(planner): a session can actually reach the daily goal, and the preview is the session (#38)
- fix(session): an unplayable exercise is skipped, not scored zero (#37)
- fix(scoring): balanced accuracy for n-back and accuracy-scaled XP (#36)
- docs: add external code, security and product review (2026-08-02) (#35)
- Hot streak: a run of near-perfect rounds steps a full level (#34)
- Resolve the three high-severity advisories via overrides (#33)
- Practice mode: any exercise at a chosen, fixed level (#32)
- Auto-confirm Pattern Recall once the full count is selected (#31)
- Add component-test infrastructure; fix post-unmount round reporting (#30)
- Polish the public face: metadata, robots.txt, onboarding copy (#29)
- Rate-limit the sync endpoint (#28)
- Derive the sync group id behind PBKDF2, not a bare hash (#26)
- Cross-compile the arm64 image instead of emulating the build (#27)
- Fix silent data loss when two devices sync at once (#25)
- Upgrade to Next.js 16 (#24)
- Correct the arm64 build note: the crash is intermittent (#23)
- Fix the arm64 Docker build, and check it before merging (#22)
- Optional AI phrasing, native-packaging ADR, VoiceOver protocol (#21)
- Honest sensory labelling with a vision-exclusion filter (#20)
- Optional E2E-encrypted device sync with self-hosted backend (#19)
- docs: drop stale unit-test count from README
- feat: three new exercises — Tone Pattern, Rhythm Recall, Dual N-Back
- feat: family profile management — launch picker, profile PIN, kid mode (closes #8)
- feat: Swedish localisation with a dependency-free i18n layer (closes #5)
- feat: response-time signals in the adaptive engine, insights, richer stats
- docs: measurement honesty and copy rules (closes #10)
- feat: backup safeguards and accessibility hardening
- ci: build in the e2e job instead of passing .next as an artifact
- fix: self-review fixes — audio-off handling, races, iOS and a11y polish
- docs+infra: Docker, CI, and complete documentation set
- test: Playwright e2e suite for critical flows on iPhone viewport
- feat: full application UI — session runner, six games, stats, profiles, PWA
- feat: core domain, adaptive difficulty, exercises, progression and storage
- chore: scaffold Next.js 15 app with TypeScript, Tailwind and test tooling
- Initialize Cortex repository
- docs: add local development environment guide
