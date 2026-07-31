# Hostel Administration — Mobile App

A React Native (Expo) rebuild of the original console-based [Hostel-Administration](../main.cpp) C++ project.
Same three roles — **Rector (Admin)**, **Warden**, **Student** — same core workflows, plus:

- Firebase Authentication instead of plaintext-password `.txt` files
- Push notifications (new notices, grievance resolutions, application decisions)
- Room allocation & occupancy tracking
- A Rector dashboard with live stats and a chart

## Tech stack

- **React Native + Expo (TypeScript)** — cross-platform mobile app
- **Firebase Auth** — email/password login, registration, password reset
- **Cloud Firestore** — application data (users, applications, notices, grievances, payments, check-logs, rooms)
- **Cloud Functions + Expo push** — server-side push notification triggers
- **React Navigation** — auth stack + per-role bottom tabs

## Project structure

```
mobile-app/
  App.tsx                  entry point
  src/
    firebase/               Firebase init (config.ts) + your local firebaseConfig.ts (gitignored)
    types/                   shared TypeScript types
    context/AuthContext.tsx  auth state, login/register/logout/reset
    navigation/              RootNavigator + per-role navigators
    screens/
      auth/                  Welcome (role select), Login, Register, ForgotPassword
      student/                Home, ApplyHostel, Notices, Grievances, PayFees
      rector/                 Dashboard (stats), Applications, PostNotice, Grievances, Rooms
      warden/                 CheckInOut, Status
    components/              Button, Input, Card, Badge, StatCard, ScreenHeader, EmptyState
    services/                Firestore read/write functions per collection
  functions/                 Cloud Functions (push notification triggers)
  firestore.rules            Firestore security rules
  firestore.indexes.json     composite indexes required by the app's queries
```

## 1. Prerequisites

- [Node.js](https://nodejs.org/) 18 or 20 LTS — **not currently installed on this machine**, install it first
- The [Expo Go](https://expo.dev/go) app on your phone (easiest way to test), or Android Studio / Xcode for an emulator
- A free [Firebase](https://console.firebase.google.com/) account

## 2. Install dependencies

```bash
cd mobile-app
npm install
```

## 3. Set up Firebase

1. Go to the [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Inside the project, go to **Build → Authentication → Get started** and enable the **Email/Password** sign-in provider.
3. Go to **Build → Firestore Database → Create database** (start in production mode; the rules file below locks it down).
4. Go to **Project settings → General → Your apps → Add app → Web** (the `</>` icon — used for the Firebase JS SDK, works fine for Expo). Copy the `firebaseConfig` object it gives you.
5. Copy `src/firebase/firebaseConfig.example.ts` to `src/firebase/firebaseConfig.ts` (already scaffolded with placeholders) and paste in your real values.
6. Install the [Firebase CLI](https://firebase.google.com/docs/cli) and deploy the security rules + indexes:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add          # select your Firebase project
   firebase deploy --only firestore:rules,firestore:indexes
   ```

## 4. Run the app

```bash
npm start
```

This opens the Expo dev tools. Scan the QR code with **Expo Go** (Android) or the **Camera app** (iOS), or press `a` / `i` for an emulator.

## 5. Push notifications (optional but included)

Push notifications work in two parts:

1. **Client**: each user's Expo push token is saved to their `users/{uid}` Firestore doc on login (see `src/services/notifications.ts`). Push tokens only work on physical devices, not simulators.
2. **Server**: `functions/index.js` has three Firestore triggers that call the Expo push API:
   - `onNoticeCreated` — broadcasts to all students when the Rector posts a notice
   - `onGrievanceUpdated` — notifies a student when their grievance is resolved
   - `onApplicationUpdated` — notifies a student when their application is approved/rejected

To deploy the functions (requires the [Blaze pay-as-you-go plan](https://firebase.google.com/pricing), which has a generous free tier):

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Data model (Firestore collections)

| Collection     | Purpose                                                     |
| -------------- | ------------------------------------------------------------ |
| `users`        | `{ uid, name, email, role, pushToken?, createdAt }`          |
| `applications` | Hostel applications with `status: pending/approved/rejected` |
| `notices`      | Rector announcements                                          |
| `grievances`   | Student complaints with `status: open/resolved`               |
| `payments`     | Fee payment proofs (transaction ID) with `status`              |
| `checklogs`    | Warden check-in / check-out entries                            |
| `rooms`        | `{ block, roomNumber, capacity, occupantIds[] }`               |

## Notes on scope

- Fee "payment" still mirrors the original app's manual UPI transaction-ID flow (enter a transaction ID, Rector confirms out-of-band) — no live payment gateway is wired up.
- The `a.exe`, `main.exe`, `tempCodeRunnerFile.*` and `.txt` data files in the repo root belong to the original C++ console app and are unrelated to this project.
