# Royal Boys Hostel — management app

One app for the admin and the branch managers of the two hostels (Thammanam
and Kalamassery). It runs on Android phones and in a browser, and keeps every
record online in Firebase, so a change on one device shows on the others at once.

## What is where

| Thing | Where it lives |
| --- | --- |
| Records (rooms, inmates, bills, notices…) | Firestore, Mumbai (`asia-south1`) |
| Photos (profile, Aadhaar, complaints) | Firebase Storage, `photos/<branch>/` |
| Logins | Firebase Authentication; who-may-do-what in `staff/<uid>` |
| Server code | `functions/` (Cloud Functions, Node 22, Mumbai) |
| Web address | Firebase Hosting: the app at `/`, the student form at `/join` |

Projects: `royal-hostel-staging` (testing). A production project is still to
be created with the same setup.

## Who can do what

- **Admin** (user ID `admin`): both hostels, the admin panel, the Logins screen
  (create a manager, reset a password, switch a login off, remove it), settings.
- **Manager**: one hostel only. Held to it by `firestore.rules` and
  `storage.rules` on the server, not just by what the app shows.
- **Students**: no login. They scan a hostel's QR code and fill in the form at
  `/join?b=<branch>`. The `join` function checks and stores it; nothing reaches
  the records until staff approve it under **Admissions**.

Nobody can sign themselves up: accounts are created only by the admin
(`scripts/lock-signup.mjs` turns self sign-up off for a project).

## Running it

```
npm install
copy .env.example .env      # then fill in the Firebase project's values
npx expo start --web        # browser, http://localhost:8081
npx expo start              # phone, with Expo Go or a development build
```

The first admin login for a new project is made from the command line
(`node scripts/create-login.mjs --username admin --name Admin --role admin --project <id>`).
Managers are then created inside the app.

## Tests

```
npm test                 # 65 checks of the app's logic, no network
npm run test:firebase    # 44 checks against local Firebase emulators, with the real rules
```

The emulators need Java (Android Studio's bundled one works: add
`C:\Program Files\Android\Android Studio\jbr\bin` to `PATH`).

## Putting a change live

```
npm run deploy:staging   # builds the site, then deploys rules, functions and hosting
```

Always clear Metro's cache when switching between projects (`expo export --clear`,
`expo start --clear`): the project's settings are baked in when the app is built.

A phone build is made with EAS (`eas build -p android --profile preview`); the
`preview` profile in `eas.json` carries the staging project's settings. After
that, everyday changes reach installed phones as over-the-air updates
(`eas update --channel preview`) the next time the app is opened.

## Layout

```
src/backend/     Firebase: sign-in, database, files, server calls
src/store/       live in-memory copy of the records, queued saves, offline handling
src/services/    the hostel's rules: rooms, inmates, fees, admissions, staff…
src/screens/     one file per screen
src/components/  shared buttons, inputs, cards
src/constants/   colours, spacing and type (theme.ts)
functions/       server code: staff (logins) and join (student form)
hosting/         the student registration page
```

## Good to know

- **Monthly bills raise themselves.** A server job (`functions/billing.js`) runs
  every morning at 00:15 India time and raises any bill missing for the
  month; the app does the same when it is opened. There is no "raise bills"
  button. A bill is due on the day of the month the inmate joined.
- **Without internet** the app shows what it last loaded. A save is kept and
  sent when the connection returns, as long as the app stays open.
- **Photos are shrunk before upload** (profile about 640px, documents about
  1400px) so they stay readable without filling the storage.
