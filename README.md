# NBTI Presence

Attendance verification for the National Board for Technology Incubation.
Staff sign in and out from their own phone or laptop. Every attempt has to
clear four gates before anything is written to the register.

| Gate | What it establishes |
|---|---|
| Location | The device is inside the site perimeter, by GPS |
| Liveness | A live person performed a head-turn order drawn at that moment |
| Surroundings | No phone, screen, laptop, printed photo or second person in frame |
| Identity | The face matches the one enrolled on that account |

A refusal at any gate stops the run, captures the frame, and writes an
incident with that photo attached. The ICT department sees the person and
whatever they were holding.

---

## What is in the box

```
supabase/schema.sql          Whole database, RLS policies, storage bucket
public/models/               Face model weights, served from your own domain
src/lib/geo.js               Perimeter check and GPS trust rules
src/lib/faceEngine.js        Detection, head pose, blink, sharpness, matching
src/lib/spoofGuard.js        Device-in-frame, screen replay, flat-surface checks
src/lib/liveness.js          The randomised head-turn challenge
src/lib/device.js            Handset fingerprint for shared-device detection
src/lib/db.js                Every database read and write
src/lib/intelligence.js      Authenticated client for AI reports and chat
src/components/VerifyFlow    The four-gate attendance run
src/components/EnrolFlow     Four-pose face enrolment
src/pages/                   Staff screens
src/pages/admin/             Administrator screens
supabase/functions/          Permission-scoped Presence Intelligence service
```

---

## Setup

### 1. Supabase

Create a project at supabase.com. Open **SQL Editor**, paste the whole of
`supabase/schema.sql`, run it. That creates every table, the row-level
security policies, the twelve NBTI departments and the private `evidence`
storage bucket.

In **Authentication → Providers → Email**, turn off "Confirm email" while you
are testing so accounts work immediately.

Copy your project URL and anon key from **Settings → API**.

### 2. Local

```bash
cp .env.example .env      # paste your URL and anon key into it
npm install
npm run dev
```

Open the address it prints. Create an account, then make yourself an
administrator by running this once in the Supabase SQL editor:

```sql
update profiles set role = 'admin' where email = 'your.email@nbti.gov.ng';
```

Sign out and back in. The Administration menu appears.

Apply the committed migrations before deploying the application. They add the
department-scoped report appointment, absence approval and notification
records without changing the existing attendance policies or reporting view:

```bash
supabase db push
```

### 2a. Presence Intelligence

The report writer and assistant run in the supplied `presence-intelligence`
Edge Function. The AI key never enters the Vite application. Deploy the
function with JWT verification enabled, then set its server-side secrets:

```bash
supabase functions deploy presence-intelligence
supabase secrets set AI_GATEWAY_API_KEY=your-gateway-key
supabase secrets set AI_MODEL_ID=openai/gpt-5.4-mini
```

`AI_MODEL_ID` can be any current text model exposed by Vercel AI Gateway. A
free model can be selected for development, but NBTI should review that
provider's retention and training terms before sending government attendance
aggregates to it. The default compact OpenAI model is chosen for report quality,
not because the platform depends on OpenAI. Switching providers is one secret
change.

The function first validates the caller's bearer token and profile. Staff
without an appointment receive only their own evidence. Directors and HODs
receive their assigned department, appointed staff receive the same department
until the appointment expires, and the Director-General or administrator can
use Board scope. The privileged database key remains inside the Edge Function
and is used only after this explicit authority check. The browser cannot use it
to query department records directly.

The model receives aggregate attendance evidence, not raw face descriptors,
incident frames or exact coordinates. Generated findings are advisory and
remain visually separate from the source charts and register. Report approvals,
refusals and revocations are written to the audit log. Absence approvals never
overwrite a day with an actual sign-in.

### 3. Set the perimeter before anyone uses it

This is the one step that cannot be skipped. The schema ships with a
placeholder coordinate for Abuja, which is not your building.

Stand in the middle of the NBTI premises, open **Settings**, press
**Use where I am standing now**, set the radius to cover the compound
(150m suits most sites) and save. Until you do this, either everyone is
refused or everyone in Abuja passes.

### 4. Deploy to Vercel

Push to GitHub, then import the repository at vercel.com.

| Setting | Value |
|---|---|
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

Add both environment variables under **Settings → Environment Variables**:

VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Deploy. `vercel.json` already routes every path back to `index.html`, so
refreshing a deep link will not 404.

Finally, add your Vercel domain to **Authentication → URL Configuration**
in Supabase, under Site URL and Redirect URLs.

---

## How each check actually works

### Location

`navigator.geolocation` at high accuracy, then a haversine distance against
the stored site coordinates. Three things are refused rather than trusted:

- A reading further from the centre than the radius.
- A reading whose own stated accuracy is worse than the configured limit,
  because "somewhere within 2km" cannot confirm presence on site.
- A reading claiming accuracy of exactly zero, which real hardware never
  reports and which is a signature of an injected position.

### Liveness

At the start of every attempt the system draws a sequence: face forward,
then two of {left, right, up} in a random order, sometimes a double blink,
then forward again. Head angle comes from the 68-point landmark map, so no
extra model is needed. Each step must be held for several consecutive frames
and times out after nine seconds.

A recorded video cannot pass this, because the recording was made before the
system chose the order.

### Surroundings

Two layers.

The first is object detection running on the live frame, before the challenge
and repeatedly during it. Phones, laptops, screens and printed pages are
refused outright. The repeat sweep matters because a phone is usually raised
only once the prompts begin.

The second catches a face on a display even when the device itself is out of
frame, using three properties that a screen has and a face does not: refresh
banding in the row-brightness profile, unnaturally even lighting across the
face, and a blue cast from a narrower panel gamut.

Then there is the geometric check. Turn a real head and the nose swings across
the face while the eye span compresses, because those features sit at different
depths. Turn a photograph and every measurement scales together, because there
is no depth to reveal. The system compares landmark ratios across the poses
captured during the challenge and refuses anything that behaved like a plane.

A second face in frame is refused immediately, since that is what proxy
sign-in looks like.

### Identity

The live face becomes a 128-number vector and is compared to the vectors
enrolled on that account. Beyond the threshold, the attempt is refused as a
mismatch and the frame is kept. That is the case where a colleague tries to
sign in on someone else's account: their face simply is not the enrolled one.

Row-level security means an account can only ever read its own face vectors,
so nobody can pull the biometric data of another member of staff.

### Shared handset

Every device produces a stable fingerprint. If the same handset records
attendance for two different people on one day, both are flagged with the
frame attached. It does not block the sign-in, because a genuine shared
office tablet exists, but it puts the pattern in front of the ICT department.

---

## What administrators can do

- **Overview** turnout, punctuality, a 30-day trend and open incidents.
- **Daily register** mark someone present who was on official duty, correct
  times, or remove an entry. Every action is written to the audit log with
  the administrator's name against it.
- **Staff** promote to administrator, deactivate, clear a face enrolment so
  someone can start again.
- **Incidents** every refused attempt with its evidence photo, an explanation
  in plain language, and a resolution note.
- **Reports** individual, departmental or Board-wide over any date range,
  with a written summary, attendance and punctuality rates, an arrival-time
  distribution, hours on site, a departmental league table and a per-person
  table. Exports to CSV.
- **Settings** perimeter, working hours, grace period and the two thresholds.

---

## Honest limits

Everything runs in a browser on a consumer camera. That is enough to defeat a
phone screen, a printed photo, a poster and a replayed video, which is the
realistic threat for staff attendance. It is not a match for a purpose-built
silicone mask, and no browser-based check is. If NBTI ever needs that grade of
assurance, it means a dedicated terminal with an infrared or depth camera at
the entrance, not a web app.

GPS indoors is the other real constraint. Deep inside a concrete building a
phone may report accuracy of 60m or worse. The perimeter radius has to be set
generously enough to absorb that, which is why 150m rather than 20m.

Face matching is not perfect either. Expect occasional false rejections in
poor light. The remedy is enrolling again in better conditions rather than
loosening the threshold, since loosening it is what lets the wrong person
through.

---

## Common problems

**"The camera could not be opened"**
Browsers only allow camera access over HTTPS. Vercel gives you that
automatically. On a local machine use `localhost`, which is treated as secure.

**Everyone is refused on location**
The perimeter was never set. See step 3.

**Legitimate staff failing the identity check**
Have them enrol again from Profile, facing a window. If it persists across
several people, raise the face match threshold slightly in Settings, one
step at a time.

**The first check on a device is slow**
The face models are about 7MB and are fetched once, then cached by the
browser. Later checks start immediately.

---

## Corrections applied after the first build

Four faults were found and fixed by reviewing the code against the security
policies rather than trusting that a clean build meant correct behaviour. They
are recorded here because two of them were serious and the reasoning is worth
keeping.

**The shared-handset check never fired.** The client queried the attendance
table for other people's rows, but row level security correctly stops a member
of staff reading anyone else's attendance, so the query returned nothing every
single time. The proxy-phone detection was silently dead. It now goes through
`shared_device_count`, a server function that answers the narrow question on
the server and returns only a count, so the check works without opening up
other people's records.

**The reporting view exposed the whole Board.** In Postgres a view runs with
its owner's permissions by default, which meant `attendance_report` bypassed
row level security entirely and any signed-in member of staff could read every
department's attendance. The view is now declared `security_invoker = true`, so
it runs as whoever queries it and the underlying policies still apply.

**The blink challenge was decorative.** Blinks were counted continuously from
the start of the run, so by the time the blink step arrived the person had
usually blinked naturally two or three times and the step passed instantly
without them doing anything. The counter is now zeroed as the step begins, so
it measures a deliberate blink. This was confirmed by simulation: the old logic
completed the full sequence on blinks made before being asked, the new logic
halts and waits.

**Incidents recorded no coordinates.** The refusal handler captured the
position variable from render time, which is null when a run starts, so every
flag raised during the challenge stored null latitude and longitude, exactly
the field an investigator would want on a spoofing incident. Position is now
held in a ref that the running check reads directly.

**Evidence uploads were unconfined.** Any authenticated user could write into
the evidence bucket at any path. Uploads are now restricted to a folder named
for the uploader.
