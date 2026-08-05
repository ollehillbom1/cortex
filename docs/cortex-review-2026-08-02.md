# Cortex: kod-, säkerhets- och produktgranskning

**Datum:** 2026-08-02  
**Granskad kod:** `8709a1a09ca47ee78b6eb7f128e0f7dab5c81186` på `main` och `origin/main`  
**Drift:** en publik self-hosted instans (adressen utelämnad avsiktligt)  
**Målgrupp:** vuxna först  
**Produktprincip:** jämn balans mellan spelglädje och ärlig mätning

## Sammanfattande bedömning

Cortex har en bra grund. Kodbasen är liten och begriplig, spelmotorerna är i huvudsak
separerade från UI, slump kan injiceras i tester, appen är local-first och
mätpolicyn undviker medicinska löften. Aktuell `main` klarar format, lint,
typkontroll, 192 enhets-/komponenttester, produktionsbygge och 25 mobila
Chromium-E2E-tester. Paket- och läckageskanning hittade inga kända sårbarheter eller
hemligheter. Den publika sidan har giltig TLS, HSTS och en i huvudsak restriktiv CSP.

De största riskerna ligger därför inte i vanlig kodkvalitet eller rå
renderingsprestanda. De ligger i fyra systemegenskaper:

1. **Publik synk är inte säker nog för vanliga användarlösenfraser eller en öppen
   internetyta.** Samma fras ger globalt samma grupp och nyckel, grupp-ID:t är både
   läs- och skrivkapabilitet, och servern saknar effektiva globala resursgränser.
2. **Flera realistiska avbrotts- och samtidighetsfall kan förlora eller förvränga
   träningsdata.** Sessionscommit är inte atomisk, hela profiler är last-write-wins,
   reset rensar inte gamla lokala sessioner efter sync och en framtida dataversion
   skrivs ned till den aktuella.
3. **Centrala spelmått kan belöna fel beteende.** N-back kan på flera nivåer ge
   positiv progression utan ett enda svar, nollresultat på hög nivå ger mer XP än ett perfekt nybörjarresultat och
   ospelbara ljudövningar kan sänka användarens skill och ändå räknas i sessionen.
4. **PWA- och iPhone-löftet är bara delvis verifierat.** Kall offline-start saknar
   byggchunkar, service workern kan behålla stale RSC-data, bakgrundning påverkar
   timers och CI kör en iPhone-viewport i Chromium men inte Safari/WebKit.

### Leveransbeslut

- **Local-only kärnapp:** rimlig för fortsatt kontrollerad användning efter att
  poängens begränsningar kommunicerats.
- **Publik device sync:** bör begränsas eller pausas tills de synkrelaterade
  P0-skydden nedan finns.
- **Mätpåståenden:** säg att Cortex mäter förbättring i de specifika Cortex-uppgifterna,
  inte IQ, hjärnhälsa, klinisk status eller generellt vardagsminne.
- **Prestanda:** bundle-optimering är inte prioritet ett; data-, PWA- och
  mätkorrekthet ger mycket större nytta.

## Metod och evidensnivå

Fynd märks med följande status:

- **Reproducerat:** dynamiskt visat med isolerad testdata eller webbläsare.
- **Kodverifierat:** kontrollflödet är entydigt, men produktionsexploatering har inte
  utförts.
- **Driftverifierat:** observerat passivt mot den publika instansen eller den lokala
  runtimecontainern.
- **Testlucka:** ett relevant påstående saknar en körande gate.

`Kritisk mätvaliditet` i tabellen är en produktseverity: ett fel gör kärnresultat
eller progression opålitlig. Det är inte samma sak som en kritisk
säkerhetssårbarhet.

Ingen lasttest, brute force, skrivande produktionsrequest, enumeration av synkgrupper
eller åtkomst till användardata utfördes.

## Prioriterad fyndöversikt

| ID       | Allvar               | Status                      | Fynd                                                          | Backlog |
| -------- | -------------------- | --------------------------- | ------------------------------------------------------------- | ------- |
| SEC-01   | Hög                  | Kod; publik route live      | Samma synkfras ger globalt samma grupp och nyckel             | P0      |
| SEC-02   | Medel                | Kod; GET-route live         | Grupp-ID ensamt ger anonym GET och PUT                        | P1      |
| SEC-03   | Hög                  | Kod; exponering/config live | Sync kan fylla disk eller minne utan global kvot              | P0      |
| SEC-04   | Medel                | Kodverifierat               | Import och dekrypterad sync saknar strikt runtime-schema      | P1      |
| SEC-05   | Medel                | Driftverifierat             | Privacy-texten är otillgänglig och delvis missvisande         | P1      |
| SEC-06   | Hög för v1           | Kod; liveförekomst okänd    | Migrerad v1-synkpost lämnas kvar utan rotation/radering       | P0      |
| SEC-07   | Medel                | Reproducerat, avstängt live | Coachens guardrail accepterar semantisk inversion             | P1      |
| SEC-08   | Medel                | Driftverifierat             | Container och supply chain saknar flera basala skydd          | P1      |
| DATA-01  | Hög                  | Kodverifierat               | Helprofil-LWW tappar samtidig XP, skills och rekord           | P0      |
| DATA-02  | Hög                  | Kodverifierat               | Sync-reset raderar inte filtrerade sessioner lokalt           | P0      |
| DATA-03  | Hög                  | Kodverifierat               | Session och profil skrivs icke-atomiskt utan fungerande retry | P0      |
| DATA-04  | Hög                  | Kodverifierat               | Färdiga block förloras vid reload, Back eller app-kill        | P1      |
| DATA-05  | Hög                  | Reproducerat                | Framtida dataversion skrivs ned till version 8                | P0      |
| DATA-06  | Medel                | Reproducerat                | Import av sessioner är O(N²)                                  | P1      |
| PWA-01   | Hög                  | Reproducerat                | Genuint kall offline-start saknar byggchunkar                 | P1      |
| PWA-02   | Hög                  | Kodverifierat               | Oversionerad cache-first kan ge stale RSC och cachetillväxt   | P1      |
| MOB-01   | Hög                  | Kodverifierat               | Låsning/appväxling förvränger timerbaserade resultat          | P1      |
| MOB-02   | Hög testlucka        | Konfigurationsverifierat    | Primärmål iPhone testas bara med Chromium-viewport            | P1      |
| MAINT-01 | Medel                | Dokumentverifierat          | Arkitektur-, test- och deploymentdokument har driftat         | P1      |
| GAME-01  | Kritisk mätvaliditet | Reproducerat                | N-back belönar `always-no`                                    | P0      |
| GAME-02  | Kritisk mätvaliditet | Reproducerat                | Ospelbara ljudblock korrumperar progression                   | P0      |
| GAME-03  | Hög                  | Kodverifierat               | Reaktionstid mäts före synlig signal och blandar modalitet    | P1      |
| GAME-04  | Hög                  | Kodverifierat               | Adaptiv latency/fatigue blandar förmåga, längd och pauser     | P1      |
| GAME-05  | Hög                  | Reproducerat                | Många nivåer 18–40 ändrar ingen svårighet                     | P1      |
| GAME-06  | Hög                  | Kodverifierat               | Statistik jämför ojämförbara spel och uppgiftsmixar           | P1      |
| GAME-07  | Hög                  | Reproducerat                | Nollresultat på nivå 40 ger mer XP än perfekt nivå 1          | P0      |
| GAME-08  | Hög                  | Reproducerat                | Ett rekommenderat pass kan inte matcha mål på 10–25 min       | P0      |

## 1. Säkerhet och integritet

### SEC-01 — deterministisk synkidentitet

**Evidens:** `src/lib/sync/crypto.ts:15-22,49-85` använder ett globalt konstant
salt och härleder både grupp-ID och nyckel deterministiskt från en fras med minlängd
åtta. `src/lib/sync/sync.test.ts:134-142` kräver uttryckligen att samma fras ger
samma grupp. Den publika sync-routen svarar.

**Konsekvens:** två orelaterade hushåll som väljer samma vanliga fras får samma grupp
och samma dekrypteringsnyckel. En angripare kan också härleda ett kandidat-ID och
använda publik 404/200 som existenssignal. PBKDF2 bromsar gissning men gör inte en
vanlig åttateckensfras högentropisk.

**Åtgärd:** begränsa omedelbart sync till en betrodd yta eller stäng funktionen
publikt. I ett v3-protokoll ska grupp-ID och datanyckel vara slumpmässiga; en
lösenfras ska endast wrappa datanyckeln med per-gruppsalt. En högentropisk invite/QR
ska föra över identiteten mellan enheter.

**Acceptans:** två nya hushåll med samma fras får olika grupp och nyckel; befintliga
v2-grupper migreras utan att data korsas.

### SEC-02 — grupp-ID är både locator och skrivkapabilitet

**Evidens:** `src/app/api/sync/[groupId]/route.ts:38-93` tillåter anonym GET och PUT.
`src/lib/sync/serverStore.ts:79-113` kräver revision men ingen proof-of-key. Grupp-ID
ligger dessutom i URL:en, som normalt hamnar i accessloggar.

**Konsekvens:** den som får grupp-ID:t kan inte läsa klartext utan nyckeln, men kan
hämta aktuell revision och ersätta serverkopian med syntaktiskt godkänd men
kryptografiskt oautentiserbar ciphertext. Lokal IndexedDB-data finns kvar, men sync
och restore fastnar tills posten återställs eller raderas. Identifieraren är inte
externt enumerable; risken förutsätter att den har läckt.

**Åtgärd:** använd separata slumpmässiga read/write/delete-kapabiliteter i header,
serververifiering, rotation och explicit retention/radering. Locator ska inte vara
hemligheten. Detta minskar klient- och loggläckagerisken men ger inte
end-to-end-skydd mot serveroperatören, som fortfarande kan radera eller korrumpera
ciphertext.

**Acceptans:** grupp-ID utan korrekt token ger 401/403 och kan aldrig ändra revision.

### SEC-03 — publik resursuttömning

**Evidens:** `route.ts:58-79` kör `request.json()` före gränskontroll.
`serverStore.ts:26-27` tillåter 8 000 000 base64-tecken. Skrivlimiten är 20 i burst
och 10/minut per nyckel (`route.ts:24-29`), utan total kvot, TTL eller maxantal
grupper. Det motsvarar ungefär 4,8 GB/timme per accepterad limiteridentitet.
`rateLimit.ts:32-58,94-99` har en 10 000-nycklars sweep och ett proxyantagande som
inte gäller för råporten.

Driftcontainern binder publikt, har `Memory=0`, inget PID-tak, skrivbart
rootfs, inga cap drops, inget `no-new-privileges` och obegränsad `json-file`-logg.

**Åtgärd:** bytebegränsa kroppen före JSON-parse, inför global byte-/gruppkvot,
behörighetsstyrd gruppskapning, concurrency- och skapandetak samt kontrollerat
507-svar. Full kvot ska stoppa nya grupper eller datatillväxt, inte oförändrade
överskrivningar av befintliga poster. Eventuell retention/TTL måste vara synlig,
varna före utgång och ha en återställningsväg så att en inaktiv användares enda
backup inte tyst raderas. Låt endast en betrodd proxy sätta client-IP och exponera
inte råporten brett. Härda containern och sätt logg- och volymövervakning.

### SEC-04 — validering som inte motsvarar dokumentationen

**Evidens:** filen läses helt via `file.text()` före gräns
(`profile/page.tsx:107-110`). `exportImport.ts:138-179` sprider `...p` och `...s` och
behåller okända/nästlade fält; preferences, skills, exercises, enum och flera
intervall valideras inte. `sync/engine.ts:152-168` castar dekrypterad data direkt till
`SyncState`. Detta motsäger `SECURITY.md:27-29`, som säger att import är strikt
strukturellt validerad, storleksbegränsad och omprojicerad.

**Åtgärd:** använd en gemensam, versionsstyrd och allowlistad runtime-validator för
import och sync. Validera varje äldre wire-version före migration och avvisa okända
framtida versioner. Kontrollera bytebudget, datum, enum, numeriska intervall,
nästlade antal och referensintegritet innan någon IndexedDB-mutation. Importen ska
vara atomisk.

### SEC-05 — privacy och export

`/privacy`, `/PRIVACY.md`, `/security` och `/SECURITY.md` ger 404 i produktion, medan
profilvyn hänvisar till “see PRIVACY”. Samma vy säger alltid att inget skickas trots
att sync eller coach kan vara aktivt (`profile/page.tsx:390-397,440-448`). Export
innehåller alla profiler på enheten, hela historiken och PIN-hash i klar JSON utan en
tydlig bekräftelse.

Publicera en lokaliserad privacy-/security-sida, gör texten state-aware och förklara
exportens faktiska omfattning, sync-retention och accessloggar. PIN ska även fortsatt
beskrivas som ett artighetsskydd, inte som kryptering.

### SEC-06–SEC-08 — livscykel, coach och leveranskedja

- V1-migreringen i `sync/engine.ts:82-112` kopierar till v2 men tar inte bort den
  äldre, billigare verifieraren. Förekomst av live-v1-data undersöktes inte. Inför
  migreringsbekräftelse eller dokumenterad grace period, verifierad backup och först
  därefter purge; lägg även till rekey och device-revocation.
- Coachens lexikala guardrail accepterar semantisk inversion, exempelvis att “lite
  uppmärksamhet” skrivs om till “din uppmärksamhet är bra”. Den är avstängd live.
  Kuraterade variant-ID:n är säkrare än fri omskrivning; behåll annars body-, origin-,
  concurrency- och client-IP-skydd.
- Aktuell GitHub har inget ruleset eller main-skydd och saknar Dependabot-konfig.
  Actions och Node-basen är tagg-, inte SHA-/digestpinnade. Lägg till required CI,
  SCA, secret-/container scan, SBOM och policy mot opinnade `uses`/`FROM`.
- CSP har `script-src 'unsafe-inline'`, men ingen nuvarande XSS-sink hittades. Ta
  minst bort inline event handlers via `script-src-attr 'none'`, arbeta mot nonce/hash
  och sätt explicit `Cache-Control: private, no-store` på API-svar.

## 2. Dataintegritet och effektivitet

### DATA-01 — helprofil-LWW tappar samtidiga framsteg

`sync/merge.ts:35-44,85-93` väljer hela den profil som har senaste klientstyrda
`updatedAt`. Sessioner unioneras separat. Om två enheter avslutar varsin session
från samma profilbas behålls båda sessionsposterna, men bara den ena profilens XP,
skills, achievements och records. Sessionhistorik och profilsummary divergerar.

Byt till eventhärledd progression eller fält-/revisionsmedveten merge. Minimikravet
är CAS/revision och återberäkning av härledda värden från sessionshändelser. Testa två
enheter och två flikar som committar samtidigt samt klockor framåt/bakåt.

### DATA-02 — reset propagates inte till lokal historik

`sync/merge.ts:47-58` filtrerar sessioner äldre än reset-watermark, men
`sync/engine.ts:196-221` raderar bara borttagna profiler och lägger till saknade
sessioner. Den tar aldrig bort en lokal session som merge filtrerat bort. Den gamla
historiken ligger därför kvar i statistik och läses in igen vid nästa sync.

Applicera sessionsdiffen atomiskt eller lagra reset som ett förstaklassfilter som
alla läsvägar respekterar. Ett tvåenhetstest ska visa att gamla sessioner försvinner
lokalt och inte återkommer efter ytterligare sync.

### DATA-03 — sessionscommit är inte atomisk

`SessionRunner.tsx:233-264` sätter `persisted.current = true` före läsningar och
skrivningar, sparar session och profil i två separata operationer och saknar ett
synligt fel-/retryläge. Om sessionsskrivningen lyckas men profilsparningen misslyckas
blir datan halvcommittad och guarden förhindrar återförsök.

Inför `commitSession()` som en enda IndexedDB-transaktion över session, profil och
relevant metadata. Sätt guarden efter lyckad commit, gör operationen idempotent och
visa retry. Felinjektion ska täcka före, mellan och efter varje skrivning.

### DATA-04–DATA-06 — avbrott, migrering och importkostnad

- Färdiga block finns bara i React-state och persist sker först vid hela passets slut
  eller appens End-knapp (`SessionRunner.tsx:87,277-309`). Checkpointa ett draft efter
  varje block och erbjud resume/discard efter reload, Safari Back eller app-kill.
- `migrateProfile()` accepterar en framtida version och returnerar alltid version 8;
  `db.ts:55-72` skriver sedan ned posten. En framtida/stale klient ska i stället
  avvisa skrivning och kräva appuppdatering.
- `exportImport.ts:117-135` läser alla befintliga sessioner för varje importerad
  session. En reproduktion med 5 000 sessioner gjorde 5 000 listningar och
  12 497 500 materialiserade postbesök; 20 000 närmar sig 200 miljoner. Läs ID:n en
  gång och batchskriv i en transaktion.
- Varje sync läser, krypterar och skriver om hela historiken. Mät först vid
  1k/5k/20k sessioner, serialisera/debounce samtidiga syncar och gå till inkrementellt
  protokoll först när en uttrycklig storleks-/tidsbudget överskrids.

## 3. PWA, mobil och prestanda

### PWA-01 — kall offline-start fungerar inte som utlovat

Service workerns install-cache innehåller HTML-routes men inget byggspecifikt
precache-manifest för JS/CSS (`public/sw.js:17-27`). Efter onboarding, rensad vanlig
HTTP-cache och offline reload saknades 11 `/_next/static`-resurser och endast
tabbraden visades. Nuvarande E2E förvärmer routes och väntar, vilket döljer felet.

Generera ett precache-manifest från aktuellt build-ID och testa kall offline-start
med CacheStorage/IndexedDB kvar men HTTP-cache rensad.

### PWA-02 — stale cache över releaser

Cache-namnet är fortfarande `cortex-v1`; övriga same-origin GET är cache-first,
vilket även omfattar Next RSC. `cache.put`, `clients.claim` och `skipWaiting` inväntas
inte konsekvent (`sw.js:14-15,30-44,73-99`). Det kan ge stale route-data, ackumulerade
gamla chunks och livscykelrace.

Använd bygg-ID i cache-namn, rensa föregående build, allowlista runtime-assets,
exkludera RSC/private routes och invänta samtliga service-worker-promises. Testa en
riktig uppgradering mellan två builds.

### MOB-01 — timers och bakgrundning

Reaction, Sequence och N-back saknar gemensam `visibilitychange`-policy. På iPhone
kan skärmlås eller appväxling därför klumpa timers och räkna bakgrundstid som
reaktionstid/fatigue. Rhythm schemalägger Web Audio-toner utan en avbrytningsreferens
(`RhythmGame.tsx:65-75`, `audio/audio.ts:101-119`), så ljud kan också fortsätta efter
att vyn lämnats. Sequence har dessutom ospårade completion-timers efter unmount
(`SequenceGame.tsx:53-85`).

Centralisera paus/abort: när sidan döljs avbryts den aktuella icke-poänggivande
rundan, ljud stoppas och omstart kräver användargest. Lägg fake-timer/unmount-test
för varje timerfamilj.

### MOB-02 — Safari, VoiceOver och språk

Playwrights “iPhone 13” använder Chromium och CI installerar bara Chromium
(`playwright.config.ts:24-28`, `.github/workflows/ci.yml:52-55`). WebKit 26.5 hämtades
under granskningen, men värden saknar tre systembibliotek och kunde därför inte
starta utan en separat administrativ paketinstallation. Ingen fysisk iPhone kördes.

Lägg WebKit som required CI-projekt och kör det dokumenterade fysiska
VoiceOver-protokollet genom onboarding, varje spel, feedback och summary. Rotlayouten
har dessutom alltid `<html lang="en">` (`src/app/layout.tsx:51`), även efter byte till
svenska; uppdatera dokumentets språk dynamiskt.

### Observerad prestanda

Aktuell liveversion hade cirka 18 ms TTFB från granskningsvärden och ungefär 226 kB
komprimerade statiska resurser på första route; sessionsrouten låg kring 237 kB.
Containern använde cirka 44 MiB i vila. Det är en bra utgångspunkt. HTTP/1.1 över
flera initiala assets och framtida bundle-tillväxt bör bevakas med en enkel budget,
men är inte en P0/P1-flaskhals i dag.

E2E-servern varnar dessutom att `next start` inte stöder `output: standalone`.
Testservern bör skapa en tillfällig staginglayout som, likt Dockerfile, kombinerar
`.next/standalone`, `public` och `.next/static` innan `server.js` startas. Då verifierar
gaten samma startform och statiska resurser som produktionen.

### MAINT-01 — dokumentation och gates beskriver inte längre verkligheten

`docs/architecture.md:3` och ADR 0001 säger Next.js 15 medan bygget använder 16.2.12.
`docs/testing.md:9` anger 110 tester mot dagens 192 och beskriver fortfarande en
annan Docker-matris än workflowfilen. README och deploymentdokumenten säger att en
512 MB Compose-gräns gäller, men livecontainern startades inte av Compose och har
ingen minnesgräns. Importens säkerhetsbeskrivning lovar samtidigt striktare
validering än koden utför.

Gör versions-, testantal- och driftpåståenden genererade eller verifierade i CI. En
säkerhetskontroll som inte körs och en dokumenterad resursgräns som inte finns live
ska båda ge en röd releasegate.

## 4. Spel, adaptivitet och mätning

### GAME-01 — N-back belönar uteblivna svar på flera nivåer

`nback.ts:95-118` använder vanlig accuracy: träffar plus korrekta avvisningar.
Generatorn skapar cirka 30 % matches för single och 25 % för dual. Strategin “tryck
aldrig” ger därför omkring 70,6 % på single nivå 2 och 73,3 % på dual nivå 1. Det
ligger i adaptivitetens målband och ger positiv nivåändring.

Använd balanserad accuracy `(hit-rate + specificity) / 2` eller ett korrekt
signal-detection-mått med skydd för små/extrema sampel. Testa `always-no`,
`always-yes`, slump och perfekt svar på nivå 1–40; ensidig respons får aldrig ge
positiv nivåändring.

### GAME-02 — otillgängligt ljud blir ett misslyckande

Domänmodellen har `requiresAudio`, men `availability.ts:15-18` filtrerar bara på syn.
Med ljud av och synkrävande spel bortfiltrerade återstår exakt tre spel och samtliga
kräver ljud. “Skip exercise” skickar samtidigt `accuracy: 0`, vilket går genom vanlig
skill-, XP- och sessionslogik.

Gör `RoundResult` till en diskriminerad union: `completed | skipped | unavailable |
aborted`. Ersätt eller hoppa hela blocket och exkludera icke-completed från skill,
XP, statistik och streak. Preferensmatrisen ska alltid ge ett spelbart pass eller ett
ärligt tomt läge.

### GAME-03 — reaktionstid är inte jämförbar

`ReactionGame.tsx:63-69` sätter starttid före React har målat GO-signalen och spelar
samtidigt en ton om ljud är på. Ljud-på och ljud-av mäter alltså olika stimulus, och
telefon/rendering ingår i rekordet. Bakgrundning och avsaknad av timeout förvärrar
detta.

Definiera separat visuell eller auditiv variant, tidsstämpla efter committed paint,
inför timeout/plausibilitetsgräns och kräv ett minsta antal giltiga rundor för
rekord. Verifiera distributionsskillnad på verklig iPhone.

### GAME-04 — latency och fatigue är sammanblandade mått

`adaptive/engine.ts:129-137` jämför rå inmatningstid med personlig median trots att
högre nivåer kräver fler siffror, toner eller rutor. Fatigue i
`SessionRunner.tsx:173-176` använder väggtid sedan sessionsstart, inklusive
instruktioner, avbrott och bakgrundstid.

Normalisera per svarsenhet och faktisk parameter/direction; mät endast aktiv
speltid. Tills modellen är validerad bör latency/fatigue vara diagnostik och inte
driva skill.

### GAME-05 — falska nivåsteg

Den globala skalan går till 40, men parametrarna är identiska från ungefär nivå 18
för N-back, 20 för Dual, 19 för Tone och Reaction, 21 för Rhythm och 30 för Pattern.
XP-bonusen fortsätter ändå att öka.

Inför `maxLevel` per spel och klampa skill/UI där, eller lägg till meningsfulla
parametrar. Ett property-test ska kräva att varje exponerat steg ändrar minst en
dokumenterad svårighetsparameter.

### GAME-06 — statistikens slutsatser är starkare än datan

“Strengths” och “Worth training” rankar rå nivå mellan olika spel
(`stats/aggregate.ts:121`), trots att nivåerna inte är jämförbara. Accuracy förväntas
dessutom ligga relativt platt när adaptiviteten lyckas. Tid-på-dagen blandar spel och
nivå; fatigue jämför första och sista block även när de är olika uppgifter.

Visa inom-spel-trender: faktisk parameter, nivåförändring vid bibehållen accuracy,
rullande median, datamängd/osäkerhet och personbästa. Stratifiera insikter efter spel
och svårighet och kalla små sampel preliminära observationer.

### GAME-07 — XP kan belöna nollprestation

`xp.ts:19-24` lägger nivåbonus oberoende av accuracy. `accuracy=0, level=40` ger 59
XP; en perfekt runda på nivå 1 ger 15 XP. Noll, skip och abort ska alltid ge noll.
Multiplicera nivåbonus med prestation eller kräv en godkänd tröskel. Tabelltesta
accuracy 0/0,5/1 på nivå 1/20/40.

### GAME-08 — dagsmålet går inte att leverera

Planeraren tillåter högst fem fasta block (`planner.ts:42-65`). De fem längsta
summerar till 416 sekunder, cirka 6,9 minuter, trots mål upp till 25 minuter och
standard 10. Med synkrävande spel bortfiltrerade är taket 232 sekunder, cirka 3,9
minuter. Hemmet använder samtidigt dagseed och 30 sessioner, medan runnern använder
tidsseed och 10, så preview och startad plan kan skilja sig.

Skapa ett immutable planobjekt/plan-ID som både preview och runner använder. Skala
rundor eller återanvänd block tills tidsbudgeten nås. Testa mål 5/10/15/20/25 över
hela preferensmatrisen med definierad tolerans.

### Lägre men verkliga spelbrister

- Rhythm skickar resultat först vid exakt antal taps; Reaction har ett timeout-
  resultattillstånd men UI startar ingen deadline. Rundor kan fastna obegränsat.
- Auditory Digits beräknar `digitMs` men UI använder inte parametern. Vid saknat
  speech-API blir uppgiften en tonsekvens men lagras under samma skill.
- Tone/Rhythm producerar potentiella personbästa som inte sparas, och XP har en
  `personalBest`-bonus som runnern aldrig matar.
- Number Span och Tone Pattern säger att varje siffra/not på rätt position räknas,
  men scoringen räknar bara längsta korrekta prefix (`instructions.ts:21,83`,
  `numberSpan.ts:62-69`, `tonePattern.ts:43-51`). Antingen copy eller metric behöver
  ändras.

## 5. Vuxen-först produktroadmap

Produktdesign kan fortsätta parallellt, men metric- och progressionsdrivna funktioner
bör inte lanseras innan GAME-01–GAME-08 är lösta; annars byggs motivation ovanpå
missvisande mätning.

### A. Fördröjd återkallning med stabilt material

Ingen av de nio övningarna använder stabilt material för retention över minuter eller
dagar. De flesta minnesspelen mäter omedelbar återgivning/arbetsminne, medan Reaction
mäter snabbhet/uppmärksamhet. Lägg till ett separat läge med stabila, icke-känsliga objekt,
exempelvis fiktiva namn–ansikten, ord–bilder eller objekt–platser, som återkommer
efter minuter och dagar. Lagra åtminstone item-ID, senaste försök, utfall,
osäkerhet/confidence, nästa due-tid och innehållsversion.

Detta gör retrieval practice och spacing meningsfullt. Forskningsstödet gäller
återkallning av material som faktiskt ska behållas, inte slumpmässiga
engångssekvenser: [Rowland 2014](https://pubmed.ncbi.nlm.nih.gov/25150680/) och
[Cepeda et al. 2006](https://pubmed.ncbi.nlm.nih.gov/16719566/).

### B. Adaptiv återkomst efter paus

Efter längre frånvaro ska appen göra en kort neutral re-probe och öka osäkerheten i
skill-estimatet i stället för att direkt fortsätta på gammal nivå. Visa detta som
“kalibrering”, inte som nivåförlust. Det gör återkomst mindre straffande och mer
ärlig.

### C. Korrigerande feedback

Efter en sekvensrunda bör användaren kunna se eller höra korrekt sekvens, sitt eget
svar, första avvikelsen och välja en icke-poänggivande korrigeringsrunda. Feedback
efter retrieval kan förbättra senare retention och korrigera fel
([Butler & Roediger 2008](https://pubmed.ncbi.nlm.nih.gov/18491500/)), men effekten i
Cortex korttidsuppgifter ska fortfarande valideras empiriskt.

### D. Roligare för vuxna utan manipulativ gamification

- Låt användaren välja mellan två likvärdiga dagliga pass, “kort” eller “fullt”, och
  byta ett block.
- Förklara varför ett spel valts: “inte spelat på fyra dagar”, “nyligen höjd nivå”
  eller “kalibrering behövs”.
- Fira verkliga personbästa och stabil prestation på högre faktisk parameter, inte
  rå nivå mellan olika spel.
- Lägg till valbara visuella teman/ljudvärldar, veckouppdrag och narrativa skins utan
  lootbox-, skuld- eller streak-straff.
- Håll practice-resultat separata från XP och skill. Undvik leaderboard över
  ojämförbara nivåer.
- Interleaving ska användas selektivt; effekten beror på material och likhet mellan
  kategorier ([Brunmair & Richter 2019](https://pubmed.ncbi.nlm.nih.gov/31556629/)).

### E. Bättre första minut

Byt de fyra huvudsakligen textbaserade onboardingsidorna mot en 60–90 sekunders
vuxen introduktion: ljudtest, syn/motion-val, realistiskt dagsmål, spelbar provrunda
och preliminär kalibrering. Kända instruktioner ska kunna fällas ihop efter första
gången.

### F. Mätärlighet som produktfördel

Behåll formuleringar som “bättre på Cortex-uppgifter”, “längre siffersekvenser” och
“stabilare prestation vid denna svårighetsgrad”. Undvik IQ, demensprevention,
hjärnhälsa och bred vardagstransfer. En stor metaanalys fann främst uppgiftsnära
förbättring och inget övertygande stöd för bred far transfer
([Melby-Lervåg, Redick & Hulme 2016](https://pubmed.ncbi.nlm.nih.gov/27474138/)).

## 6. Beslutsfärdig åtgärdsbacklog

### P0 — före bredare användning eller fortsatt publik sync

1. Begränsa/pausa publik sync och råport; inför proxy-bodylimit, rate-/skapandekvot,
   containergränser och logrotation.
2. Specificera sync v3 med slumpad grupp/datanyckel, separata kapabiliteter,
   retention, radering och migrering/purge av v1/v2.
3. Inför atomisk, idempotent sessionscommit och skydd mot framtida dataversion.
4. Ersätt helprofil-LWW eller återberäkna progression från events; fixa resetens
   lokala sessionsdiff.
5. Korrigera N-back-score, noll-XP och audio/skip-semantik.
6. Gör tidsplanen uppnåelig och identisk mellan preview och runner.

### P1 — robust telefonprodukt

1. Gemensam strikt schema-/bytevalidator för import och sync; batchad atomisk import.
2. Byggspecifik service-worker-cache, riktig kall-offline- och två-builds-updategate.
3. Gemensam visibility-/abortpolicy för timers och ljud.
4. WebKit som required CI, dynamiskt `lang` och fysisk iPhone/VoiceOver genom hela
   spelresan.
5. Per-spel maxnivå, normaliserad latency, reaktionsprotokoll och inom-spel-statistik.
6. Publicerad state-aware privacy-sida, coach-hardening och supply-chain-gates.

### P2 — träningsdjup och glädje

1. Stabilt delayed-recall-läge med due-schema och återkomstkalibrering.
2. Strukturerad korrigerande feedback och icke-poänggivande retry.
3. Spelbar onboarding, transparent planval och kort/fullt pass.
4. Vuxna teman, veckouppdrag och PB-firanden med mätpolicy som automatisk copy-gate.

## 7. Nya testinvarianter

- Samma syncfras i två nya hushåll skapar inte samma grupp.
- Group-ID utan token kan varken läsa, skriva eller radera.
- Oversize/chunked body avvisas innan full buffer; global kvot håller disk och minne
  bounded.
- Två samtidiga sessionscommits bevarar båda sessionsposter och all progression.
- Reset på en enhet tar bort gammal historik på den andra och den återkommer inte.
- Framtida data-/syncversion muterar aldrig lokal lagring.
- Import med fel nested types, enorma okända fält eller avbrott lämnar DB oförändrad;
  20k sessioner är linjärt/batchat.
- `always-no` och `always-yes` klarar inte N-back; skip/noll ger noll XP och ingen
  skill-/streakförändring.
- Varje exponerat nivåsteg ändrar minst en faktisk parameter.
- Mål 5/10/15/20/25 minuter kan planeras inom fast tolerans och preview är exakt den
  startade planen.
- Kall offline-start fungerar utan vanlig HTTP-cache; uppgradering mellan två builds
  visar aldrig stale RSC.
- Appväxling/skärmlås aborterar rundan utan progression eller falsk latency.
- Kritiska flöden går i Chromium och WebKit; fysisk iPhone/VoiceOver verifierar
  onboarding, varje spel, feedback och summary.

## 8. Verifieringsprotokoll

| Kontroll                                           | Resultat                                                        |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `git fetch --prune origin`; HEAD mot `origin/main` | Samma SHA, ren arbetskopia före rapporten                       |
| `npm run verify`                                   | PASS                                                            |
| Vitest                                             | 20 filer, 192/192 PASS                                          |
| `npm run e2e`                                      | 25/25 PASS, mobile Chromium, 1,4 min                            |
| Produktionsbuild                                   | PASS, Next.js 16.2.12                                           |
| `npm audit` full + production                      | 0 kända sårbarheter                                             |
| OSV Scanner, `package-lock.json`                   | 547 paket, 0 fynd                                               |
| Gitleaks                                           | 42 commits, 0 läckor                                            |
| GitHub CI på granskat SHA                          | PASS                                                            |
| GitHub ruleset/branch protection                   | Saknas                                                          |
| Live TLS/headers                                   | Giltigt certifikat, HSTS, CSP; `unsafe-inline` kvar             |
| Live `/api/health`                                 | `200 {"status":"ok"}`                                           |
| Live coach                                         | `configured:false`                                              |
| Live service worker                                | SHA-256 matchar repot                                           |
| Live privacy-route                                 | 404                                                             |
| Live container                                     | Healthy, icke-root; inga memory/PID/hardeningtak                |
| WebKit                                             | Runtime hämtad, men launch blockerad av saknade systembibliotek |
| Fysisk iPhone/VoiceOver                            | Ej körd; kvarvarande manuell gate                               |

## Avgränsningar

- Ingen aktiv pentest eller belastning mot produktion.
- Ingen läsning av befintliga synkblobbar eller andra användardata.
- Ingen fysisk iPhone fanns tillgänglig.
- Rapporten ändrar inga API:er, lagringsscheman, produktfunktioner eller
  driftinställningar. Varje faktisk åtgärd bör genomföras som en separat, testbunden
  ändring i backlogordning.
