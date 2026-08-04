# Testing the Wear OS companion

No physical watch required — everything below runs against a Wear OS emulator.

---

## Three things that silently break the Data Layer

Each one produces a watch app that installs, launches and looks fine while
receiving nothing at all.

1. **Same package name *and* same signing certificate.** Play Services only
   bridges the Data Layer between apps matching on both, which is why
   `wear/build.gradle` borrows `:app`'s signing config for both build types. If
   the watch is stuck on "Open Wavio on your phone" while the phone logs
   successful puts, check this first — the two SHA-256 fingerprints must match:
   ```sh
   keytool -list -v -keystore apps/mobile/android/app/debug.keystore \
     -storepass android -alias androiddebugkey | grep SHA256
   ```
2. **The emulator image must include Play Services** — an `android-wear` image,
   *not* `android-wear-cn`.
3. **The watch APK shares `applicationId` with the phone app**, so installing it
   on the phone *replaces Wavio*. Never run a bare `./gradlew :wear:installDebug`
   with both devices attached; always target a serial (see §3).

---

## 1. Create and pair the emulators

Android Studio → Device Manager → **+** → **Wear OS** → *Wear OS Large Round* →
download the **API 34 (Wear OS 5), arm64, Google APIs** image → Finish.

Then pair it with a **phone emulator**: Device Manager → ⋮ on the Wear AVD →
**Pair Devices for Wear OS** → pick a phone AVD (create a Pixel API 34+ **Google
Play** image if you don't have one). The assistant does the whole handshake,
companion app included.

Note both identifiers once they're up — every command below targets one
explicitly. Which emulator grabs `5554` depends on boot order, so identify them
rather than assuming; the watch is the one whose `ro.build.characteristics`
contains `watch`:

```sh
for s in $(adb devices | awk 'NR>1 && $2=="device"{print $1}'); do
  echo "$s  $(adb -s $s emu avd name 2>/dev/null | head -1)  $(adb -s $s shell getprop ro.build.characteristics)"
done
```

Each emulator has **two** identifiers, and they are not interchangeable:

| Identifier | Example | Used by |
|---|---|---|
| adb serial | `emulator-5554` | every `adb -s …` command below |
| AVD name | `Pixel_9_API_36` | `expo run:android --device` **only** |

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

Then install to the paired phone (Metro must stay running). `bun run
mobile:android` can't forward `--device` through `eas env:exec`'s quoted
command, so run it directly:

```sh
cd apps/mobile
eas env:exec --non-interactive development \
  "DARK_MODE=media bunx expo run:android --device <phone-avd-name>"
```

- `--device` wants the **AVD name**, not the adb serial (see §1).
- `bunx` is not optional: `eas env:exec` runs through `/bin/sh` without
  `node_modules/.bin` on `PATH`, so a bare `expo` fails.

Sanity check that the native module loaded, before touching the watch:

```sh
adb -s <phone-serial> logcat -s ReactNativeJS | grep -i wear
```

`WearBridge.available` being false means autolinking missed
`modules/wear-bridge` — re-run prebuild.

---

## 3. Build and install the watch app

Build the APK, then install it **to an explicit serial** (see hazard 3):

```sh
cd apps/mobile/android
./gradlew :wear:assembleDebug
adb -s <wear-serial> install -r ../wear/build/outputs/apk/debug/wear-debug.apk
adb -s <wear-serial> shell am start -n com.jmercier.wavio/com.jmercier.wavio.wear.MainActivity
```

The first build downloads the Compose and Play Services artifacts; expect a few
minutes. Watch-only rebuilds are just the commands above and take seconds — no
prebuild, no phone rebuild.

### Check the two version codes

The watch's version code is derived from `:app` at configuration time rather
than stamped during prebuild, so it's only observable once both APKs are built
and installed. Both apps share an application id, so ask each device what *it*
installed; the watch must report the phone's code plus 1000000:

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
| D5 | Start playback, then swipe the phone app away (audio keeps playing) | Watch keeps tracking the track and position; its transport controls still work |
| D6 | Force-stop the phone app, connect Android Auto, start playback **from the car** | Watch shows the car's track and can control it |

D3 is the per-scope isolation rule the rest of the app follows.

D5 and D6 are why the JS half lives in `services/wear/session.ts`, started from
`index.js`, rather than in a component: in both, the process and the JS runtime
are alive but no React surface is mounted. Failing them looks worse than D1 —
the DataItems are retained, so the watch shows a stale track with buttons that
appear live instead of "Open Wavio on your phone".

### E. Protocol compatibility

Covered by `__tests__/wearProtocol.test.ts` (`bun run mobile:test`). Manually
confirm one case the unit tests can't reach: install an **older** watch build
against a newer phone build after adding a field, and check that the watch
ignores what it doesn't understand instead of crashing.

---

## 6. Known-unverified

Both `modules/wear-bridge` and `apps/mobile/wear` compile in **debug** and
**release** — `:wear:assembleDebug`, plus the `production-wear` (AAB) and
`production-wear-apk` (sideloadable APK) profiles — with the pinned versions in
`wear/build.gradle`: Compose BOM `2025.02.00`, Wear Compose `1.4.1`,
`play-services-wearable:18.2.0`. Release signing and the version-code offset
are confirmed on both artifacts: each is signed with the EAS upload keystore
rather than the debug one, and carries the phone's remote version code plus
1000000.

Compiling is not running, though — **none of the runtime behaviour in §5 has
been exercised yet**.

Rotary scroll on the queue list is not wired (touch scrolling works); rotary is
only used for seeking on the player screen.
