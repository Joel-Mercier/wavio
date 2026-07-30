# Testing the Wear OS companion

No physical watch required. Everything below runs against a Wear OS emulator.

---

## Three things that will silently break the Data Layer

Read these before anything else — each one produces a watch app that installs,
launches, and looks fine while receiving nothing at all.

1. **Same package name *and* same signing certificate.** Play Services only
   bridges the Data Layer between apps that match on both. `wear/build.gradle`
   borrows `:app`'s signing config for *both* build types to guarantee this. If
   you ever see the watch stuck on "Open Wavio on your phone" while the phone
   logs successful puts, check this first:
   ```sh
   # The two SHA-256 fingerprints must be identical.
   keytool -list -v -keystore apps/mobile/android/app/debug.keystore \
     -storepass android -alias androiddebugkey | grep SHA256
   ```

2. **The emulator image must include Google Play Services.** Pick an
   `android-wear` image, *not* `android-wear-cn` (the China variant ships
   without Play Services, so the Data Layer never starts).

3. **The watch APK shares `applicationId` with the phone app.** Installing it
   on the phone *replaces Wavio*. Never run a bare `./gradlew :wear:installDebug`
   with both devices attached — always target a serial explicitly (see step 3).

---

## 0. Prerequisites

```sh
bun install
bun run mobile:typecheck && bun run mobile:lint && bun run mobile:test
```

Your legacy `~/Library/Android/sdk/tools/bin/sdkmanager` is broken under Java 17.
To get a working CLI: Android Studio → Settings → Languages & Frameworks →
Android SDK → **SDK Tools** tab → check **Android SDK Command-line Tools
(latest)**. Everything below also has a UI equivalent if you'd rather skip that.

---

## 1. Create the Wear OS emulator

**UI route (no cmdline-tools needed):** Android Studio → Device Manager → **+** →
**Wear OS** → *Wear OS Large Round* → download the **API 34 (Wear OS 5), arm64,
Google APIs** image → Finish.

**CLI route** (arm64 host):

```sh
SDK=$HOME/Library/Android/sdk
$SDK/cmdline-tools/latest/bin/sdkmanager "system-images;android-34;android-wear;arm64-v8a"
$SDK/cmdline-tools/latest/bin/avdmanager create avd \
  -n WearOS_API34 -k "system-images;android-34;android-wear;arm64-v8a" -d wearos_large_round
```

Boot it and note its serial (usually `emulator-5554`):

```sh
emulator -avd WearOS_API34 &
adb devices -l
```

### Pairing

**Pair with a phone *emulator*.** Android Studio → Device Manager → ⋮ on the Wear
AVD → **Pair Devices for Wear OS** → pick a phone AVD (create a Pixel API 34+
**Google Play** image if you don't have one). The assistant does the whole
handshake, including the companion app. Nothing to install by hand.

Note both identifiers once they're up — from here on every command targets one
explicitly. Which emulator grabs `5554` depends only on boot order, so identify
them rather than assuming; the watch is the one whose `ro.build.characteristics`
contains `watch`:

```sh
for s in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
  echo "$s  $(adb -s $s emu avd name 2>/dev/null | head -1)  $(adb -s $s shell getprop ro.build.characteristics)"
done
```

Each emulator has **two** identifiers and they are not interchangeable:

| Identifier | Example | Used by |
|---|---|---|
| adb serial | `emulator-5554` | every `adb -s …` command below |
| AVD name | `Pixel_9_API_36` | `expo run:android --device` **only** |

Passing a serial to `expo run:android` fails with `Could not find device with
name:` — it matches on the AVD name.

#### Why not a physical phone?

Pairing an emulated watch to a real phone needed *Wear OS by Google*
(`com.google.android.wearable.app`) and its **Pair with emulator** menu item.
Google delisted that app for Android 14+, and neither successor replaces it:
**Galaxy Wearable** pairs only Samsung watches, **Pixel Watch** pairs only real
Pixel Watches over BLE. Neither can target an emulator, so the old
`adb forward tcp:5601 tcp:5601` route is unreachable.

Sideloading an old 2.x companion APK is the only remaining option and is not
recommended: newer builds dropped the emulator-pairing entry point, older ones
tend to fail the Play Services version check on Android 15.

Little is actually lost. The cases below that look like they want real hardware —
B2, B5, C1–C3 — all measure *watch-side* behaviour, and the watch is emulated
either way. A real phone would not have bought real doze fidelity. The parts of
this feature that genuinely need hardware need a real **watch**, not a real phone.

Confirm the two are actually bridged before going further:

```sh
adb -s <wear-serial> shell dumpsys activity service WearableService | grep -i "connected\|peer"
```

---

## 2. Build and install the phone app

`android/` is regenerated here, which is what runs `plugins/withWearOS.js`:

```sh
bun run mobile:prebuild
```

Verify the plugin did its two jobs — both must print:

```sh
cd apps/mobile
grep -c "include ':wear'"                    android/settings.gradle    # 1
grep    "org.gradle.jvmargs"                 android/gradle.properties  # -Xmx4096m
```

Then install to the phone you paired (Metro must stay running). With a watch AVD
attached — and possibly a physical phone too — `expo run:android` must be told
which one, and `bun run mobile:android` can't forward the flag through
`eas env:exec`'s quoted command. Run it directly:

```sh
cd /Users/joel/www/wavio/apps/mobile
eas env:exec --non-interactive development \
  "DARK_MODE=media bunx expo run:android --device <phone-avd-name>"
```

Two gotchas in that one line:

- `--device` wants the **AVD name** (`Pixel_9_API_36`), not the adb serial —
  see the table in §1.
- `bunx` is not optional: `eas env:exec` runs the command through `/bin/sh`
  without `node_modules/.bin` on `PATH`, so a bare `expo` fails with
  `expo: command not found`. The `package.json` scripts get away with it
  because Bun adds that directory when running a script.

Sanity check that the native module loaded, before touching the watch:

```sh
adb -s <phone-serial> logcat -s ReactNativeJS | grep -i wear
```

`WearBridge.available` being false means autolinking missed
`modules/wear-bridge` — re-run prebuild.

---

## 3. Build and install the watch app

Build the APK, then install it **to an explicit serial**. Do not use
`installDebug`; see hazard 3 above.

```sh
cd /Users/joel/www/wavio/apps/mobile/android
./gradlew :wear:assembleDebug
adb -s <wear-serial> install -r ../wear/build/outputs/apk/debug/wear-debug.apk
adb -s <wear-serial> shell am start -n com.jmercier.wavio/com.jmercier.wavio.wear.MainActivity
```

First build downloads the Compose and Play Services artifacts; expect a few
minutes. Subsequent watch-only rebuilds are the two commands above and take
seconds — you do **not** need to re-run prebuild or rebuild the phone app to
iterate on watch UI.

### Check the two version codes

Only now — with both apps installed — can this be verified. The watch's version
code is derived from `:app` at configuration time rather than stamped during
prebuild, so it isn't observable until each APK is built and on a device. Both
apps share an application id, so ask each device what *it* installed; the watch
must report the phone's code plus 1000000:

```sh
adb -s <phone-serial> shell dumpsys package com.jmercier.wavio | grep versionCode
adb -s <watch-serial> shell dumpsys package com.jmercier.wavio | grep versionCode
```

If the watch reports the *same* code as the phone, `:wear` didn't pick up the
offset and Play will later reject the pair.

---

## 4. Logs

Both sides log under the same tag, so one filter covers everything:

```sh
adb -s <phone-serial> logcat -s WavioWear ReactNativeJS   # puts, capability changes, dropped commands
adb -s <wear-serial>  logcat -s WavioWear                 # retained reads, asset decodes, send failures
```

The phone's JS layer logs under `[wear]` in `ReactNativeJS`, and only in
`__DEV__`.

---

## 5. Test protocol

### A. Happy path

| # | Do | Expect |
|---|---|---|
| A1 | Start playback on the phone | Watch shows title, artist, artwork within ~1s |
| A2 | Watch the progress ring for 30s | Advances smoothly — it is interpolated locally, not polled |
| A3 | Tap play/pause on the watch | Phone reacts; watch icon flips |
| A4 | Tap next / previous | Phone changes track; watch metadata *and* artwork follow |
| A5 | Turn the rotary crown | Scrub preview updates immediately; phone seeks ~350ms after you stop |
| A6 | Open the queue (list icon) | Shows a window around the current track, current row highlighted |
| A7 | Tap a queue row | Phone jumps to that track, watch returns to the player |
| A8 | Toggle shuffle / cycle repeat | Phone's player screen reflects both; repeat cycles off → all → one |

For A7, deliberately test with a **long** queue (300+ tracks, e.g. a large
playlist) and scroll to a row far from the current one. That exercises the
`baseIndex` offset maths — a bug there sends the wrong absolute index and the
phone jumps to the wrong track.

### B. Reconnect and recovery

This is the DataClient retention story; each case must resolve with **no user
action** on the watch.

| # | Do | Expect |
|---|---|---|
| B1 | Kill the wear emulator, change tracks on the phone, reboot the emulator, open Wavio | Shows the **current** track, not the one from before |
| B2 | `adb -s <wear> shell svc bluetooth disable`, change tracks, re-enable | Watch catches up on its own |
| B3 | Force-stop the phone app (`adb -s <phone> shell am force-stop com.jmercier.wavio`) while playing, relaunch it | Watch resynchronises once JS is back |
| B4 | Reboot the phone with the watch app open | Watch recovers on reconnect |
| B5 | Let the watch screen sleep for 10 min while playing, wake it | Position is *correct*, not 10 minutes behind |

B5 is specifically testing the `sentAtEpochMs` staleness correction — a retained
state item read on wake is old, and the watch has to add its age back.

### C. Battery and traffic discipline

The point of the design is that a wrist-down watch costs nothing. Verify rather
than assume:

| # | Do | Expect |
|---|---|---|
| C1 | Play a track with the watch screen **off** | **Zero** `/wavio/v1/progress` traffic. The watch sends `unsubscribe` on pause |
| C2 | Play a full track with the screen **on** | Progress messages at ~2/s, no faster |
| C3 | Pause and leave it 60s | No repeated state writes — the dedup signature excludes position |
| C4 | Play 3 tracks from the same album | Artwork published **once**, not per track (same `artworkKey`) |
| C5 | Skip within an already-mirrored queue | A light index update, not a full queue re-push |
| C6 | Run the phone with **no watch paired** | No puts at all; one capability query at startup |

C6 is the regression that matters most for everyone who doesn't own a watch.

### D. Degradation

| # | Do | Expect |
|---|---|---|
| D1 | Force-stop the phone app with **nothing playing**, then tap play on the watch | Watch shows last-known state and "Open Wavio on your phone" — no hang, no crash |
| D2 | Turn off Bluetooth, tap a control | "Can't reach your phone" appears |
| D3 | Sign out / switch servers on the phone | Watch state and artwork clear; nothing from the old server lingers |
| D4 | Play a local-library track with no cover art | Placeholder icon, no crash, no blank title |

D3 is the per-scope isolation rule the rest of the app follows.

### E. Protocol compatibility

Covered by `__tests__/wearProtocol.test.ts` (`bun run mobile:test`). Manually
confirm one case the unit tests can't reach: install an **older** watch build
against a newer phone build after adding a field, and check that the watch
ignores what it doesn't understand instead of crashing.

---

## 6. Release builds

The `:app:`-scoped gradle commands in `eas.json` mean `preview` and
`production-apk*` never build `:wear`. The watch artifact has its own profile:

```sh
eas build -p android --profile production-wear
```

Combining the phone AAB and the watch AAB into a **single** Play release is
manual — `eas submit` uploads one artifact per invocation and creates its own
release. Submit the phone build as usual, then attach the watch AAB to the same
draft release in the Play Console before rolling out.

---

## 7. Known-unverified

Both `modules/wear-bridge` and `apps/mobile/wear` now compile in **debug**
(`:app:assembleDebug` and `:wear:assembleDebug` both succeed). The pinned
dependency versions in `wear/build.gradle` — Compose BOM `2025.02.00`, Wear
Compose `1.4.1`, `play-services-wearable:18.2.0` — resolved without adjustment.

Compiling is not running: none of the runtime behaviour in §5 has been exercised
yet.

Still unverified:

- `signingConfig project(':app').android.buildTypes.release.signingConfig`,
  which assumes EAS injects its keystore into `:app`'s `release` build type.
  Only debug has been built, and debug borrows the debug keystore, so this says
  nothing about whether the release path works.
- Everything in §5.
- **The watch's `targetSdkVersion 35` on an API 35+ device.** Play requires Wear
  submissions to target 35 from **2026-08-31**, so `wear/build.gradle` sets it,
  but the Android 15 behaviour changes that opts into only apply when the app is
  *running* on API 35+. The API 34 AVD in §1 therefore never exercises them.
  Before submitting `production-wear`, do one pass on a newer image:

  ```sh
  SDK=$HOME/Library/Android/sdk
  $SDK/cmdline-tools/latest/bin/sdkmanager "system-images;android-35-ext15;android-wear;arm64-v8a"
  ```

  Keep the API 34 AVD for day-to-day work — a new AVD has to be re-paired.
  Images at 36+ use the different `android-wear-signed` tag.

Rotary scroll on the queue list is not wired (touch scrolling works); rotary is
only used for seeking on the player screen.
