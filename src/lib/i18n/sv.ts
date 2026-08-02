/**
 * Swedish dictionary. Keys are the English source strings (gettext style);
 * `{name}` placeholders are interpolated after lookup. Anything missing here
 * falls back to English — the app never breaks on an untranslated string.
 */
export const SV: Record<string, string> = {
  // Tab bar
  Today: "Idag",
  Train: "Träna",
  Stats: "Statistik",
  Profile: "Profil",

  // Greetings / home
  "Night owl": "Nattuggla",
  "Good morning": "God morgon",
  "Good afternoon": "God eftermiddag",
  "Good evening": "God kväll",
  Practice: "Öva",
  "Practice {name} at a level you choose": "Öva {name} på en nivå du väljer",
  "Practice settings": "Övningsinställningar",
  "Pick a fixed difficulty and go. Practice does not affect XP, streak or level.":
    "Välj en fast svårighetsnivå och kör. Övning påverkar inte XP, svit eller nivå.",
  "Practice — does not affect XP, streak or level": "Övning — påverkar inte XP, svit eller nivå",
  Level: "Nivå",
  "Lower level": "Sänk nivån",
  "Raise level": "Höj nivån",
  Rounds: "Rundor",
  Default: "Standard",
  "Start practice": "Starta övning",
  "Daily streak": "Daglig svit",
  "Train today to keep your streak": "Träna idag för att behålla din svit",
  "Profile: {name}": "Profil: {name}",
  "Level progress": "Nivåframsteg",
  "Level {n}": "Nivå {n}",
  "Today's training": "Dagens träning",
  "Goal reached ✓": "Mål uppnått ✓",
  "about {min} min · {count} exercises": "ca {min} min · {count} övningar",
  "Train again": "Träna igen",
  "Start session": "Starta pass",
  "Daily goal": "Dagligt mål",
  "Daily goal progress": "Framsteg mot dagligt mål",
  Strengths: "Styrkor",
  "Strengths and focus areas": "Styrkor och fokusområden",
  "Worth training": "Värt att träna",
  "Train to find out": "Träna för att ta reda på det",
  Recent: "Senaste",
  "Recent sessions": "Senaste passen",
  "All stats": "All statistik",
  "No sessions yet. Your first session takes about {goal} minutes.":
    "Inga pass ännu. Ditt första pass tar cirka {goal} minuter.",
  Session: "Pass",
  "Training insight": "Träningsinsikt",
  "No answer — tap to try again": "Inget svar — tryck för att försöka igen",
  "Dismiss insight for today": "Dölj insikten för idag",

  // Backup reminder
  "Backup reminder": "Påminnelse om säkerhetskopia",
  "Back up your progress?": "Säkerhetskopiera dina framsteg?",
  "Your training lives only in this browser. A quick JSON export keeps it safe.":
    "Din träning finns bara i den här webbläsaren. En snabb JSON-export håller den säker.",
  "Export now": "Exportera nu",
  "Remind me later": "Påminn mig senare",

  // Insights
  "A short session today keeps your {n}-day streak alive.":
    "Ett kort pass idag håller din {n}-dagarssvit vid liv.",
  "{modality} has had little attention lately — {exercise} would balance things out.":
    "{modality} har fått lite uppmärksamhet på sistone — {exercise} skulle jämna ut det.",
  "{modality} has had little attention lately.":
    "{modality} har fått lite uppmärksamhet på sistone.",
  "Your accuracy tends to dip late in sessions — slightly shorter sessions might land more of your rounds in the sweet spot.":
    "Din träffsäkerhet brukar sjunka sent i passen — något kortare pass kan ge fler rundor i rätt zon.",
  "{part} sessions have scored highest for you so far ({best}% vs {worst}%).":
    "{part}: dina pass har hittills gett högst resultat då ({best} % mot {worst} %).",

  // Exercise registry
  "Number Span": "Sifferminne",
  "Sequence Memory": "Sekvensminne",
  "Pattern Recall": "Mönsterminne",
  "N-Back": "N-back",
  "Sound Span": "Ljudminne",
  Reaction: "Reaktion",
  "Hold digits in mind, forwards and backwards": "Håll siffror i minnet, framlänges och baklänges",
  "Repeat the order the tiles light up": "Upprepa ordningen som rutorna tänds i",
  "Rebuild the pattern from a brief glimpse": "Återskapa mönstret efter en kort glimt",
  "Spot repeats from N steps ago": "Upptäck upprepningar från N steg tillbaka",
  "Recall spoken digits you cannot see": "Kom ihåg upplästa siffror du inte kan se",
  "React the instant the signal turns": "Reagera i samma ögonblick som signalen slår om",

  // Modalities & day parts
  "Working memory": "Arbetsminne",
  "Visual memory": "Visuellt minne",
  "Auditory memory": "Auditivt minne",
  Attention: "Uppmärksamhet",
  Speed: "Snabbhet",
  Morning: "Morgon",
  Afternoon: "Eftermiddag",
  Evening: "Kväll",
  Night: "Natt",

  // Exercises page
  "Training library": "Övningsbibliotek",
  "Play any exercise on its own — results still count towards your progress.":
    "Spela valfri övning för sig — resultaten räknas ändå in i dina framsteg.",
  recent: "senaste",
  "Levels adapt to keep each exercise challenging but doable. Scores reflect in-app performance only — they are not medical or IQ measurements.":
    "Nivåerna anpassas så att varje övning är utmanande men görbar. Poängen speglar bara prestation i appen — de är inga medicinska eller IQ-mått.",

  // Stats page
  Statistics: "Statistik",
  "In-app training performance — not a medical or IQ measurement.":
    "Träningsresultat i appen — inget medicinskt mått eller IQ-mått.",
  Totals: "Totalt",
  Sessions: "Pass",
  Minutes: "Minuter",
  "Best streak": "Längsta svit",
  "Activity over the last four weeks": "Aktivitet de senaste fyra veckorna",
  "Last 4 weeks": "Senaste 4 veckorna",
  "Training minutes per day": "Träningsminuter per dag",
  "{days} active days · {min} min trained": "{days} aktiva dagar · {min} min tränade",
  "Accuracy trend": "Träffsäkerhetstrend",
  "Choose exercise": "Välj övning",
  "{name} accuracy": "Träffsäkerhet i {name}",
  "Response time trend": "Svarstidstrend",
  "response time": "svarstid",
  "{name} average response time": "Genomsnittlig svarstid i {name}",
  "Average reaction per session — lower is faster.":
    "Genomsnittlig reaktion per pass — lägre är snabbare.",
  "Average answer time per session — context for the accuracy trend, not a score.":
    "Genomsnittlig svarstid per pass — kontext till träffsäkerheten, inte en poäng.",
  "Accuracy by time of day": "Träffsäkerhet efter tid på dygnet",
  "Time of day": "Tid på dygnet",
  "{n} session": "{n} pass",
  "{n} sessions": "{n} pass",
  "When your sessions score best — an in-app observation, nothing more.":
    "När dina pass ger bäst resultat — en observation i appen, inget mer.",
  "Exercise levels": "Övningsnivåer",
  "{n} rounds": "{n} rundor",
  "{n} round": "{n} runda",
  "Training balance": "Träningsbalans",
  "Personal records": "Personliga rekord",
  Achievements: "Utmärkelser",
  unlocked: "upplåst",
  "Best reaction": "Bästa reaktion",
  "Number span": "Sifferspann",
  "Sound span": "Ljudspann",
  "Longest sequence": "Längsta sekvens",
  ms: "ms",
  digits: "siffror",
  steps: "steg",

  // Charts
  "No data yet.": "Ingen data ännu.",
  "{label}: latest {last}, {n} data points, from {first}.":
    "{label}: senaste {last}, {n} datapunkter, från {first}.",
  "{label}: active on {active} of the last {n} days.":
    "{label}: aktiv {active} av de senaste {n} dagarna.",
  "{label}: {pct} percent of recent training": "{label}: {pct} procent av senaste träningen",

  // Welcome / onboarding
  "Step {step} of {total}": "Steg {step} av {total}",
  "Train your mind, a few minutes a day": "Träna hjärnan, några minuter om dagen",
  "Cortex is a personal trainer for memory, attention and speed: short, focused exercises designed for daily 5–20 minute sessions.":
    "Cortex är en personlig tränare för minne, uppmärksamhet och snabbhet: korta, fokuserade övningar för dagliga pass på 5–20 minuter.",
  "It measures your in-app performance — accuracy, span, reaction time — and shows how it develops. It does not measure IQ, and it makes no medical claims.":
    "Den mäter din prestation i appen — träffsäkerhet, spann, reaktionstid — och visar hur den utvecklas. Den mäter inte IQ och gör inga medicinska anspråk.",
  "Why train working memory?": "Varför träna arbetsminnet?",
  "Working memory is what holds a phone number while you dial, a recipe step while you stir, the thread of a conversation while you listen. Like most skills, the abilities you practise are the ones that grow.":
    "Arbetsminnet är det som håller ett telefonnummer medan du slår det, ett receptsteg medan du rör i grytan, tråden i ett samtal medan du lyssnar. Som med de flesta färdigheter är det förmågorna du övar som växer.",
  "Short daily sessions beat rare long ones: a focused streak builds span, sharpens attention and speeds up recall — and Cortex shows you that progress, session by session.":
    "Korta dagliga pass slår sällsynta långa: en fokuserad svit bygger spann, skärper uppmärksamheten och snabbar upp minnet — och Cortex visar dig framstegen, pass för pass.",
  "Always the right challenge": "Alltid rätt utmaning",
  "Every exercise adapts to you. Do well and the difficulty rises gently; struggle and it eases off.":
    "Varje övning anpassar sig efter dig. Går det bra höjs svårigheten varsamt; går det trögt backar den.",
  "Cortex aims for the zone where you succeed about three times out of four — hard enough to be worth doing, never punishing.":
    "Cortex siktar på zonen där du lyckas ungefär tre gånger av fyra — svårt nog att vara värt det, aldrig straffande.",
  "Yours. Private. Offline.": "Ditt. Privat. Offline.",
  "Everything is stored on this device, in your browser. No account, no cloud, no tracking.":
    "Allt sparas på den här enheten, i din webbläsare. Inget konto, inget moln, ingen spårning.",
  "You can export your data as a file any time, and install Cortex on your home screen to train offline.":
    "Du kan när som helst exportera din data som en fil, och installera Cortex på hemskärmen för att träna offline.",
  "Create your profile": "Skapa din profil",
  "Profiles keep training separate for each person in your household.":
    "Profiler håller träningen åtskild för varje person i hushållet.",
  "Your name": "Ditt namn",
  "Pick an avatar": "Välj en avatar",
  Avatar: "Avatar",
  "Get started": "Kom igång",
  Continue: "Fortsätt",
  Back: "Tillbaka",
  "Start training": "Börja träna",

  // Session runner
  "Today's session": "Dagens pass",
  "Session progress": "Passets förlopp",
  "Exercise {i} of {total}": "Övning {i} av {total}",
  "How it works": "Så fungerar det",
  "Scoring:": "Poäng:",
  "Start {name}": "Starta {name}",
  "round {i}/{total}": "runda {i}/{total}",
  "Perfect!": "Perfekt!",
  "Well done": "Bra jobbat",
  "Keep at it": "Kämpa på",
  "End session": "Avsluta pass",
  "End session?": "Avsluta passet?",
  "End this session?": "Avsluta det här passet?",
  "Keep training": "Fortsätt träna",
  "{n} completed exercise will be saved. The current exercise is discarded.":
    "{n} slutförd övning sparas. Den pågående övningen förkastas.",
  "{n} completed exercises will be saved. The current exercise is discarded.":
    "{n} slutförda övningar sparas. Den pågående övningen förkastas.",
  "Nothing has been completed yet, so nothing will be saved.":
    "Inget har slutförts ännu, så inget kommer att sparas.",

  // Session summary
  "Session complete": "Passet slutfört",
  "{n} exercise": "{n} övning",
  "{n} exercises": "{n} övningar",
  "{pct}% average accuracy": "{pct} % genomsnittlig träffsäkerhet",
  "{pct}% accuracy": "{pct} % träffsäkerhet",
  "avg {ms} ms": "snitt {ms} ms",
  "{n}-day streak": "{n} dagars svit",
  "(freeze used)": "(frysning använd)",
  "Level {n} progress": "Framsteg nivå {n}",
  "{xp} XP to level {next}": "{xp} XP till nivå {next}",
  "New personal best — {what}": "Nytt personligt rekord — {what}",
  "Achievement unlocked —": "Utmärkelse upplåst —",
  "Best reaction time": "Bästa reaktionstid",
  "Longest number span": "Längsta sifferspann",
  "Longest sound span": "Längsta ljudspann",
  "Strong block — difficulty will nudge upwards next time.":
    "Starkt block — svårigheten höjs lite till nästa gång.",
  "Right in the training zone. That effortful feeling is the point.":
    "Mitt i träningszonen. Känslan av ansträngning är själva poängen.",
  "Tough one today — levels adjust so the next session lands closer to your range.":
    "Tufft idag — nivåerna justeras så att nästa pass hamnar närmare din nivå.",
  Done: "Klar",
  "View statistics": "Visa statistik",

  // Shared game UI
  "Digit keypad": "Sifferknappsats",
  "Delete last digit": "Radera senaste siffran",
  "Entered {n} of {total} digits": "Angivit {n} av {total} siffror",
  "Tile {n}": "Ruta {n}",
  "{size} by {size} tile grid": "Rutnät {size} gånger {size}",
  "{size} by {size} pattern grid": "Mönsterrutnät {size} gånger {size}",

  // Number span game
  "Memorise the digits…": "Memorera siffrorna …",
  "Enter the digits in order": "Ange siffrorna i ordning",
  "Enter the digits in REVERSE order": "Ange siffrorna i OMVÄND ordning",
  "Backwards! Last digit first.": "Baklänges! Sista siffran först.",
  "Span {n} · forward": "Spann {n} · framlänges",
  "Span {n} · reverse": "Spann {n} · baklänges",

  // Sequence game
  "Watch the sequence…": "Titta på sekvensen …",
  "Repeat it — {n}/{total}": "Upprepa den — {n}/{total}",
  "{n} of {total} steps": "{n} av {total} steg",

  // Pattern game
  "Memorise the {n} lit tiles…": "Memorera de {n} tända rutorna …",
  "Rebuild the pattern — {n}/{total} selected": "Återskapa mönstret — {n}/{total} valda",
  "Confirm pattern": "Bekräfta mönster",
  "{n} of {total} tiles": "{n} av {total} rutor",
  "{n} wrong": "{n} fel",

  // N-back game
  "tap Match when the position repeats from {n} step ago":
    "tryck Träff när positionen upprepas från {n} steg tillbaka",
  "tap Match when the position repeats from {n} steps ago":
    "tryck Träff när positionen upprepas från {n} steg tillbaka",
  "N-back position grid": "N-back-positionsrutnät",
  Match: "Träff",
  "Correct match": "Rätt träff",
  "Not a match — hold steady": "Ingen träff — håll emot",
  "{hits} hits · {missed} missed · {fa} false alarms":
    "{hits} träffar · {missed} missade · {fa} falsklarm",

  // Auditory game
  "Sound on? Tap play when you are ready to listen.":
    "Ljud på? Tryck på spela när du är redo att lyssna.",
  "Listen to the digits…": "Lyssna på siffrorna …",
  "Listen to the melody…": "Lyssna på melodin …",
  "Enter the digits you heard": "Ange siffrorna du hörde",
  "Replay the melody on the pads": "Spela upp melodin på plattorna",
  "Play the audio sequence": "Spela upp ljudsekvensen",
  "Play sequence": "Spela sekvens",
  "{n} digits will be spoken.": "{n} siffror kommer att läsas upp.",
  "{n} notes will play.": "{n} toner kommer att spelas.",
  "Sound pads": "Ljudplattor",
  "Sound pad {n}": "Ljudplatta {n}",
  "{n} spoken digits · forward": "{n} upplästa siffror · framlänges",
  "{n} spoken digits · reverse": "{n} upplästa siffror · baklänges",
  "{n}-note melody": "Melodi med {n} toner",
  "Audio is not available": "Ljud är inte tillgängligt",
  "Sound is turned off for this profile, and Sound Span only works by ear. Enable sound under Profile → Preferences, then try again — or skip this exercise.":
    "Ljudet är avstängt för den här profilen, och Ljudminne fungerar bara på gehör. Slå på ljudet under Profil → Inställningar och försök igen — eller hoppa över övningen.",
  "This browser could not start sound playback, and Sound Span only works by ear. Check your volume or silent switch and try again, or skip this exercise.":
    "Webbläsaren kunde inte starta ljuduppspelning, och Ljudminne fungerar bara på gehör. Kontrollera volymen eller ljudlös-knappen och försök igen, eller hoppa över övningen.",
  "Try again": "Försök igen",
  "Skip exercise": "Hoppa över övning",
  "Skipped — no audio": "Hoppade över — inget ljud",

  // Reaction game
  "Tap to arm": "Tryck för att starta",
  "Wait for it…": "Vänta …",
  "Too early!": "För tidigt!",
  "Tap the panel, then hold steady until it turns green.":
    "Tryck på panelen och håll dig sedan stilla tills den blir grön.",
  "Steady… wait for GO.": "Lugnt … vänta på GO.",
  "Now!": "Nu!",
  "Too fast to be a reaction — that round does not count.":
    "För snabbt för att vara en reaktion — den rundan räknas inte.",
  "Nice. Next round coming up.": "Snyggt. Nästa runda kommer strax.",
  "False start": "Tjuvstart",

  // Instructions (registry)
  "Digits appear one at a time. Read them silently and hold the sequence in mind.":
    "Siffror visas en i taget. Läs dem tyst och håll sekvensen i minnet.",
  "When the digits disappear, enter them with the keypad — in the same order, or in reverse when the round asks for it.":
    "När siffrorna försvinner anger du dem med knappsatsen — i samma ordning, eller baklänges när rundan ber om det.",
  "The sequence grows as you improve.": "Sekvensen växer i takt med att du blir bättre.",
  "Each digit in the right position counts. A full sequence is a perfect round.":
    "Varje siffra på rätt plats räknas. En hel sekvens är en perfekt runda.",
  "You can use your physical keyboard: digits, Backspace and Enter.":
    "Du kan använda ditt fysiska tangentbord: siffror, Backsteg och Enter.",
  "Watch the tiles light up in order.": "Titta när rutorna tänds i ordning.",
  "When the playback ends, tap the tiles in the same order.":
    "När uppspelningen är klar trycker du på rutorna i samma ordning.",
  "Longer and faster sequences unlock as you improve.":
    "Längre och snabbare sekvenser låses upp när du blir bättre.",
  "Your streak of correct taps from the start of the sequence counts.":
    "Din svit av rätta tryck från sekvensens början räknas.",
  "A pattern of highlighted tiles appears briefly — memorise which tiles were lit.":
    "Ett mönster av tända rutor visas kort — memorera vilka rutor som lyste.",
  "When the grid clears, tap the tiles that were part of the pattern, then confirm.":
    "När rutnätet släcks trycker du på rutorna som ingick i mönstret och bekräftar.",
  "Correct tiles score; wrong tiles subtract. Rebuild the exact pattern for a perfect round.":
    "Rätt rutor ger poäng; fel rutor drar av. Återskapa exakt mönster för en perfekt runda.",
  "A square appears in one of nine positions, step by step.":
    "En kvadrat visas i en av nio positioner, steg för steg.",
  "Tap Match whenever the position is the same as it was N steps earlier. Do nothing when it is not.":
    "Tryck Träff när positionen är samma som för N steg sedan. Gör inget när den inte är det.",
  "You start at 1-back (same as the previous step). Higher levels move to 2-back and 3-back.":
    "Du börjar med 1-back (samma som föregående steg). Högre nivåer går till 2-back och 3-back.",
  "Correct matches and correct passes both count. Tapping Match when there is no match (a false alarm) costs accuracy.":
    "Rätta träffar och rätta pass räknas båda. Att trycka Träff utan träff (falsklarm) kostar träffsäkerhet.",
  "You can press the space bar instead of tapping Match.":
    "Du kan trycka på mellanslag i stället för att trycka Träff.",
  "Listen: digits are spoken aloud, one at a time. There is nothing to read.":
    "Lyssna: siffror läses upp, en i taget. Det finns inget att läsa.",
  "When the voice stops, enter the digits you heard in the same order.":
    "När rösten tystnar anger du siffrorna du hörde i samma ordning.",
  "If speech is not available, the exercise switches to tone sequences: listen to the melody and replay it on the four sound pads.":
    "Om uppläsning inte är tillgänglig växlar övningen till tonsekvenser: lyssna på melodin och spela upp den på de fyra ljudplattorna.",
  "Each digit (or tone) in the right position counts.":
    "Varje siffra (eller ton) på rätt plats räknas.",
  "This exercise needs sound. Check your volume and silent-mode switch before starting — you can adjust volume in Profile.":
    "Den här övningen kräver ljud. Kontrollera volymen och ljudlös-läget innan du börjar — volymen justeras under Profil.",
  "Hold steady while the panel is dim — the wait is random on purpose.":
    "Håll dig stilla medan panelen är mörk — väntetiden är slumpmässig med flit.",
  "The instant it turns bright and says GO, tap (or press the space bar).":
    "I samma ögonblick som den lyser upp och visar GO trycker du (eller trycker mellanslag).",
  "Tapping early is a false start and does not count.":
    "Att trycka för tidigt är en tjuvstart och räknas inte.",
  "Your reaction time in milliseconds, measured from the moment the panel actually changes. Lower is better. A tap too fast to be a reaction does not count, and a round left unanswered for three seconds is dropped rather than scored.":
    "Din reaktionstid i millisekunder, mätt från när panelen faktiskt ändras. Lägre är bättre. En tryckning som är för snabb för att vara en reaktion räknas inte, och en runda som lämnas obesvarad i tre sekunder kastas i stället för att poängsättas.",

  // Achievements
  "First Steps": "Första stegen",
  "Complete your first training session.": "Slutför ditt första träningspass.",
  Regular: "Stammis",
  "Complete 10 training sessions.": "Slutför 10 träningspass.",
  Dedicated: "Hängiven",
  "Complete 50 training sessions.": "Slutför 50 träningspass.",
  "Warming Up": "Uppvärmd",
  "Train 3 days in a row.": "Träna 3 dagar i rad.",
  "One Full Week": "En hel vecka",
  "Train 7 days in a row.": "Träna 7 dagar i rad.",
  "Habit Formed": "Vanan sitter",
  "Train 30 days in a row.": "Träna 30 dagar i rad.",
  "Gaining Momentum": "Fart framåt",
  "Reach profile level 5.": "Nå profilnivå 5.",
  Sharpened: "Skärpt",
  "Reach profile level 10.": "Nå profilnivå 10.",
  "Seven Digits": "Sju siffror",
  "Recall a span of 7 digits or more.": "Kom ihåg ett spann på 7 siffror eller mer.",
  Lightning: "Blixten",
  "Average under 250 ms in a Reaction block.": "Snitta under 250 ms i ett Reaktionsblock.",
  "Two Back": "Två tillbaka",
  "Reach 2-back in the N-Back exercise.": "Nå 2-back i N-back-övningen.",
  Flawless: "Felfri",
  "Finish an exercise block at 100% accuracy.": "Avsluta ett övningsblock med 100 % träffsäkerhet.",
  "Well Rounded": "Allsidig",
  "Train four different exercises in one session.": "Träna fyra olika övningar i ett pass.",

  // Profile page
  Profiles: "Profiler",
  "Profiles on this device": "Profiler på den här enheten",
  active: "aktiv",
  Name: "Namn",
  Cancel: "Avbryt",
  Create: "Skapa",
  "Add household profile": "Lägg till hushållsprofil",
  "member since {date}": "medlem sedan {date}",
  "Welcome, {name}!": "Välkommen, {name}!",
  Preferences: "Inställningar",
  Sound: "Ljud",
  "Tones and spoken digits during exercises": "Toner och upplästa siffror under övningar",
  Volume: "Volym",
  "Larger text": "Större text",
  "Increase text size across the app": "Öka textstorleken i hela appen",
  "Reduce motion": "Minska rörelse",
  "Minimise animations (also follows your system setting)":
    "Minimera animationer (följer även systeminställningen)",
  "AI phrasing of insights": "AI-formulering av insikter",
  "Let the language model on your own server reword the daily insight. It only ever receives the numbers behind that insight — never names — and the original wording is kept if anything looks off.":
    "Låt språkmodellen på din egen server formulera om dagens insikt. Den får bara siffrorna bakom insikten — aldrig namn — och originaltexten behålls om något ser fel ut.",
  "Skip exercises that need sight": "Hoppa över övningar som kräver syn",
  "Leave grid, position and signal exercises out of recommendations and the library. The remaining exercises are played entirely by ear.":
    "Utelämna rutnäts-, positions- och signalövningar från rekommendationer och biblioteket. Övriga övningar spelas helt med hörseln.",
  "Needs sight": "Kräver syn",
  "Needs sound": "Kräver ljud",
  "Needs sight and sound": "Kräver syn och ljud",
  "Show {n} exercises that need sight": "Visa {n} övningar som kräver syn",
  "Daily goal in minutes": "Dagligt mål i minuter",
  Language: "Språk",
  Automatic: "Automatiskt",
  "Your data": "Din data",
  "Everything is stored locally in this browser — nothing is sent anywhere. Export a backup before clearing browser data or moving devices.":
    "Allt lagras lokalt i den här webbläsaren — inget skickas någonstans. Exportera en säkerhetskopia innan du rensar webbläsardata eller byter enhet.",
  "Last export:": "Senaste export:",
  never: "aldrig",
  "Storage is protected against automatic clean-up.":
    "Lagringen är skyddad mot automatisk rensning.",
  "Storage may be cleared under pressure.": "Lagringen kan rensas vid utrymmesbrist.",
  "Request protection": "Begär skydd",
  "Persistent-storage API not available here.":
    "API för beständig lagring är inte tillgängligt här.",
  "Persistent storage granted.": "Beständig lagring beviljad.",
  "Export JSON": "Exportera JSON",
  "Import JSON": "Importera JSON",
  "Reset progression": "Nollställ framsteg",
  "Delete profile": "Radera profil",
  "Export downloaded. Keep it somewhere safe.":
    "Exporten laddades ner. Förvara den på ett säkert ställe.",
  "Imported {p} profile(s) and {s} session(s). Skipped {skipped} existing item(s).":
    "Importerade {p} profil(er) och {s} pass. Hoppade över {skipped} befintliga poster.",
  "Import failed — file not recognised.": "Importen misslyckades — filen kändes inte igen.",
  "Progression reset. Profile and preferences kept.":
    "Framstegen nollställda. Profil och inställningar behålls.",
  "Install Cortex": "Installera Cortex",
  "Install on your phone": "Installera på din telefon",
  "On iPhone: open Cortex in Safari, tap the Share button, then Add to Home Screen. Cortex then runs full-screen and works offline. On Android, choose Install app from the browser menu.":
    "På iPhone: öppna Cortex i Safari, tryck på Dela-knappen och sedan Lägg till på hemskärmen. Cortex körs då i helskärm och fungerar offline. På Android väljer du Installera app i webbläsarens meny.",
  "Cortex · brain training · results reflect in-app performance, not clinical cognition.":
    "Cortex · hjärnträning · resultaten speglar prestation i appen, inte klinisk kognition.",
  "Reset progression?": "Nollställa framstegen?",
  "Delete profile?": "Radera profilen?",
  "Delete {name}?": "Radera {name}?",
  "XP, levels, streak, records, achievements and session history will be permanently removed. The profile itself is kept. Consider exporting first.":
    "XP, nivåer, svit, rekord, utmärkelser och passhistorik tas bort permanent. Själva profilen behålls. Överväg att exportera först.",
  "This permanently removes the profile and all of its training history from this device. Consider exporting first.":
    "Detta tar permanent bort profilen och hela dess träningshistorik från den här enheten. Överväg att exportera först.",
  Reset: "Nollställ",
  Delete: "Radera",

  // Family profiles: picker, PIN, kid mode
  "Who is training?": "Vem ska träna?",
  "Don't ask next time": "Fråga inte nästa gång",
  "Ask who's training at start": "Fråga vem som tränar vid start",
  "Show the profile picker when the app opens": "Visa profilväljaren när appen öppnas",
  "PIN protected": "PIN-skyddad",
  "Enter PIN for {name}": "Ange PIN för {name}",
  "PIN code": "PIN-kod",
  "Wrong PIN — try again.": "Fel PIN — försök igen.",
  Unlock: "Lås upp",
  "Kid mode": "Barnläge",
  "Larger interface and a gentler difficulty ramp": "Större gränssnitt och mjukare svårighetskurva",
  "Profile PIN": "Profil-PIN",
  "A PIN is required to switch to this profile.": "PIN krävs för att byta till den här profilen.",
  "Ask for a 4-digit PIN when switching to this profile. Not a security feature — see PRIVACY.":
    "Kräv en 4-siffrig PIN vid byte till den här profilen. Ingen säkerhetsfunktion — se PRIVACY.",
  "Remove PIN": "Ta bort PIN",
  "Set PIN": "Ange PIN",
  "PIN set for {name}.": "PIN satt för {name}.",
  "PIN removed.": "PIN borttagen.",
  "Set a profile PIN": "Välj en profil-PIN",
  "A courtesy barrier for household profiles — anyone with access to this browser can still reach the data. Choose 4 digits.":
    "En artighetsspärr för hushållsprofiler — den som har tillgång till webbläsaren kan ändå nå datan. Välj 4 siffror.",
  "New PIN": "Ny PIN",
  "Repeat PIN": "Upprepa PIN",
  "The PINs do not match.": "PIN-koderna stämmer inte överens.",

  // New exercises: tone pattern, rhythm, dual n-back
  "Tone Pattern": "Tonmönster",
  "Replay a melody by ear": "Spela upp en melodi på gehör",
  "Rhythm Recall": "Rytmminne",
  "Tap back the rhythm you heard": "Knacka tillbaka rytmen du hörde",
  "Dual N-Back": "Dubbel N-back",
  "Track positions and sounds at the same time": "Håll koll på positioner och ljud samtidigt",
  "{n} of {total} notes": "{n} av {total} toner",
  "{n} of {total} intervals in time": "{n} av {total} intervall i takt",
  "Listen to the rhythm…": "Lyssna på rytmen …",
  "Now tap it back — {n}/{total}": "Knacka tillbaka den — {n}/{total}",
  "A rhythm with {n} beats will play.": "En rytm med {n} slag kommer att spelas.",
  "Tap the rhythm here": "Knacka rytmen här",
  "Tap here": "Knacka här",
  "Tone Pattern only works by ear. Enable sound and check your volume, then try again — or skip this exercise.":
    "Tonmönster fungerar bara på gehör. Slå på ljudet och kontrollera volymen, försök sedan igen — eller hoppa över övningen.",
  "Rhythm Recall only works by ear. Enable sound and check your volume, then try again — or skip this exercise.":
    "Rytmminne fungerar bara på gehör. Slå på ljudet och kontrollera volymen, försök sedan igen — eller hoppa över övningen.",
  "Dual N-Back needs sound for its second stream. Enable sound and check your volume, then try again — or skip this exercise.":
    "Dubbel N-back kräver ljud för sin andra ström. Slå på ljudet och kontrollera volymen, försök sedan igen — eller hoppa över övningen.",
  "Sound on? The letters are spoken aloud.": "Ljud på? Bokstäverna läses upp.",
  "Start the stream": "Starta strömmen",
  "Position match: left button or the A key. Sound match: right button or the L key.":
    "Positionsträff: vänstra knappen eller A-tangenten. Ljudträff: högra knappen eller L-tangenten.",
  "Dual {n}-back": "Dubbel {n}-back",
  Position: "Position",
  "Position {p}% · Sound {s}%": "Position {p} % · Ljud {s} %",
  "Two streams run at once: a square appears in one of nine positions while a letter is spoken aloud.":
    "Två strömmar går samtidigt: en kvadrat visas i en av nio positioner medan en bokstav läses upp.",
  "Tap Position (or press A) when the position matches N steps back. Tap Sound (or press L) when the sound matches N steps back.":
    "Tryck Position (eller A) när positionen matchar N steg tillbaka. Tryck Ljud (eller L) när ljudet matchar N steg tillbaka.",
  "Both, one, or neither can match on any step. Start calm — dual n-back is hard for everyone.":
    "Båda, en eller ingen kan matcha i varje steg. Ta det lugnt — dubbel n-back är svårt för alla.",
  "Each stream is scored separately (matches and false alarms); your result is the average of the two.":
    "Varje ström poängsätts separat (träffar och falsklarm); ditt resultat är snittet av de två.",
  "This exercise needs sound for the spoken letters. Keyboard: A for position, L for sound.":
    "Övningen kräver ljud för de upplästa bokstäverna. Tangentbord: A för position, L för ljud.",
  "A short melody plays on the numbered sound pads.":
    "En kort melodi spelas på de numrerade ljudplattorna.",
  "When it ends, replay it: tap the pads in the same order, by ear.":
    "När den är slut spelar du upp den igen: tryck på plattorna i samma ordning, på gehör.",
  "More pads and longer melodies unlock as you improve.":
    "Fler plattor och längre melodier låses upp när du blir bättre.",
  "Each note in the right position counts. The whole melody is a perfect round.":
    "Varje ton på rätt plats räknas. Hela melodin är en perfekt runda.",
  "This exercise needs sound. Check your volume before starting.":
    "Övningen kräver ljud. Kontrollera volymen innan du börjar.",
  "Listen to a short rhythm — the pad pulses with every beat.":
    "Lyssna på en kort rytm — plattan pulserar vid varje slag.",
  "When it ends, tap the same rhythm back on the pad.":
    "När den är slut knackar du tillbaka samma rytm på plattan.",
  "Your overall speed can differ a little; it is the pattern between taps that counts.":
    "Din totala hastighet får skilja lite; det är mönstret mellan slagen som räknas.",
  "Each gap between taps that lands close enough to the original counts. Missing or extra taps subtract.":
    "Varje mellanrum mellan slag som hamnar nära originalet räknas. Missade eller extra slag drar av.",

  // Sync
  "Sync between devices": "Synka mellan enheter",
  "Optional: sync profiles and history between devices via your own server. Data is end-to-end encrypted with a passphrase — the server only ever stores ciphertext.":
    "Valfritt: synka profiler och historik mellan enheter via din egen server. Datan är totalsträckskrypterad med en lösenfras — servern lagrar bara chiffertext.",
  "Enable sync": "Aktivera synk",
  "Disable sync": "Stäng av synk",
  "Sync now": "Synka nu",
  "Syncing…": "Synkar …",
  "Last sync:": "Senaste synk:",
  "last attempt failed:": "senaste försöket misslyckades:",
  "Synced.": "Synkat.",
  "Sync failed — see the status below.": "Synken misslyckades — se status nedan.",
  "Sync is on. This device now shares data with everyone using the same passphrase.":
    "Synken är på. Den här enheten delar nu data med alla som använder samma lösenfras.",
  "Sync is off. Local data stays on this device.":
    "Synken är av. Lokal data stannar på den här enheten.",
  "Security upgrade available": "Säkerhetsuppgradering tillgänglig",
  "This device still uses the old key derivation, which made the passphrase easier to guess from the server's files. Enter your passphrase to upgrade — your synced data comes with you. Until you do, this device will not see devices that have already upgraded.":
    "Den här enheten använder fortfarande den gamla nyckelhärledningen, som gjorde lösenfrasen lättare att gissa utifrån serverns filer. Ange din lösenfras för att uppgradera — din synkade data följer med. Tills dess ser den här enheten inte enheter som redan uppgraderat.",
  "Upgrade sync security": "Uppgradera synksäkerheten",
  "Choose a strong passphrase (at least {n} characters). It is the only key to your data: anyone who knows it can read and change the synced data, and it cannot be recovered if lost.":
    "Välj en stark lösenfras (minst {n} tecken). Den är enda nyckeln till din data: den som kan frasen kan läsa och ändra synkad data, och den går inte att återställa om den tappas bort.",
  "Sync passphrase": "Synk-lösenfras",
  "Already use Cortex? Restore from sync": "Använder du redan Cortex? Återställ från synk",
  "Restore from sync": "Återställ från synk",
  Restore: "Återställ",
  "Enter the sync passphrase you use on your other device. Profiles and history are fetched from your server and this device joins the sync group.":
    "Ange synk-lösenfrasen du använder på din andra enhet. Profiler och historik hämtas från din server och den här enheten går med i synk-gruppen.",
  "No data found for that passphrase. Check the spelling, or create a new profile.":
    "Ingen data hittades för den lösenfrasen. Kontrollera stavningen, eller skapa en ny profil.",
  "Sync failed: {error}": "Synken misslyckades: {error}",

  // App shell
  "A new version of Cortex is ready.": "En ny version av Cortex är redo.",
  Reload: "Ladda om",
};
