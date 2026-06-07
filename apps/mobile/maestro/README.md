# Maestro E2E tests

End-to-end UI tests for the Wavio mobile app, written as [Maestro](https://docs.maestro.dev) flows.

## Layout

```
maestro/
  config.yaml            Workspace config — defines what counts as a runnable flow + run order
  flows/                 Runnable entry points — one journey per feature area
    auth/login.yaml                 sign in -> land on Home (smoke)
    navigation/navigation.yaml      tabs + drawer + Servers/Activity/Libraries/Shares
    home/home.yaml                  feed "See all" -> section detail + Radio sub-tab
    home/radio.yaml                 Radio sub-tab -> radio search screen + back
    library/library.yaml            filter chips toggle the list + Favorites screen + favorites search
    library/library-search.yaml     library search screen: chips + query + filter toggle
    search/search.yaml              genres + query/results/filter + open result + recent-searches store
    settings/settings.yaml          open Settings -> scroll every section + offline-downloads manager
    playback/playback.yaml          play -> full player transport + "…" menu -> queue
    playback/player-extras.yaml     player "…" menu: Lyrics dialog + Sleep timer + Similar songs
    playback/queue-management.yaml  queue toolbar: create-from-queue dialog (cancel) + Clear queue
    playback/album-actions.yaml     track "…" menu (Add to playlist + Track info) + album "…" menu (Add to queue)
    playback/favorite-toggle.yaml   player heart: star then un-star a track (write path, self-cleaning)
    browse/artist.yaml              album -> Go to artist -> artist detail + Discography
    browse/profile.yaml             drawer "See profile" -> profile + (conditional) edit profile
    playlists/playlists.yaml        create -> open -> edit -> delete a playlist (write path, self-cleaning)
    playlists/smart-playlist.yaml   create -> open -> delete a smart playlist (Navidrome-only, self-cleaning)
    auth/logout.yaml                logout -> back on the sign-in screen
  subflows/              Reusable building blocks, pulled in via `runFlow`
    login-demo.yaml          clean launch + one-tap demo-server login -> Home
    open-drawer.yaml         tap the avatar -> open the navigation drawer (tab-agnostic)
    play-first-album.yaml    Home -> open first album -> Play -> mini-player mounted
```

**One journey per feature area, not per screen.** Each `launchApp { clearState }`
is a full app restart + re-login, so spinning one up for every individual screen is
wasteful and slow. Instead, each flow does a single cold start (via `login-demo`)
and then walks all the *related* screens in that area in one session — e.g.
`navigation.yaml` covers the tab bar, the drawer and two drawer destinations
together. Genuinely independent concerns (a write path, session teardown) stay in
their own flow.

The flows/subflows split is the other architectural choice ([repository configuration docs](https://docs.maestro.dev/maestro-flows/workspace-management/design-your-test-architecture/repository-configuration)):
`config.yaml` only matches `flows/**`, so every file under `subflows/` is a shared
helper that never executes on its own. The subflows are the reusable "get to a
known state" steps the journeys compose via `runFlow`: `login-demo` ("logged-in
Home"), `open-drawer` ("drawer open"), `play-first-album` ("a track is playing").
Only `login-demo` clears state — the others navigate from wherever the caller is,
so a single journey chains several without extra restarts.

## Backend / data

The flows drive the **public Navidrome demo server** (`https://demo.navidrome.org`,
`demo`/`demo`) via the login screen's one-tap **Demo mode** button. We deliberately
test against a real backend rather than mocking the zustand/MMKV stores: Maestro
can't write into MMKV, and the dispatch layer + axios interceptors are part of what
these critical paths exist to verify.

When a flow *does* need to fabricate a value, Maestro's `output` object — populated
via `evalScript`/`runScript` — is the place to stash it and feed it back into
commands. `playlists.yaml` uses this: it mints a run-unique, timestamped name
(`output.playlistName = 'maestro-' + Date.now()`) so repeated runs never collide on
the shared demo server and every assertion targets exactly the playlist it made.
That flow also deletes what it creates, so it leaves no artifact behind. (This is
value injection, not store mocking — MMKV stays untouched.)

Because album/track titles on the demo server aren't guaranteed, the flows select
content with stable, content-agnostic handles: visible i18n text (filter chips,
section headings, action labels), the `alt="Album cover"` image label, and a small
set of `testID`s added to the app:

| testID | Where | Used by |
| --- | --- | --- |
| `album-play-button` | album header Play button (`AlbumDetail`) | play-first-album subflow |
| `floating-player` | mini-player (`FloatingPlayer`) | play-first-album subflow, playback |
| `floating-player-play-pause` | mini-player play/pause (`FloatingPlayer`) | _(reserved)_ |
| `open-drawer-button` | user avatar in every tab header | open-drawer subflow |
| `home-radio-tab` | Radio sub-tab on Home (`HomeTabsNav`) | home, radio |
| `library-create-button` | Library "+" button | playlists |
| `library-search-button` | Library header search icon (`(library)/index`) | library-search |
| `album-menu-button` | album header "…" menu (`AlbumDetail`) | album-actions, artist |
| `track-menu-button` | per-track "…" menu (`TrackListItem`) | album-actions |
| `playlist-menu-button` | playlist header "…" menu (`PlaylistDetail`) | playlists |
| `genre-item` | each genre tile (`GenreListItem`) | search |
| `search-clear-button` | clear "X" in the search field (`recent-searches`) | search |
| `track-info-close-button` | Track info modal close "X" (`TrackActionsProvider`) | album-actions |
| `player-play-pause-button` / `player-previous-button` / `player-next-button` / `player-queue-button` / `player-menu-button` | full player transport + "…" menu (`player.tsx`) | playback |
| `player-favorite-button` | full player heart toggle (`player.tsx`, `AnimatedHeart`) | favorite-toggle |

The press wrappers `FadeOut` / `FadeOutScaleDown` forward a `testID` prop to their
underlying `Pressable`, which is how the avatar / transport / "+" handles are wired
without changing the visual tree. `AnimatedHeart` forwards `testID` to its animated
`Pressable` the same way, exposing the player's favorite toggle.

## Running

Requires a **`preview` or `production`** build installed on a booted device/emulator
— NOT the `development` build (the Expo dev client's launcher + dev menu block the
flows). Build with `cd apps/mobile && eas build --profile preview --platform android`.

```sh
# from apps/mobile
maestro test maestro/                       # run everything, honoring config.yaml order
maestro test maestro/flows/auth/login.yaml  # a single flow
maestro test --include-tags smoke-test maestro/   # filter by tag
```

Tags in use: `smoke-test`, `auth`, `search`, `playback`, `queue`, `navigation`,
`home`, `radio`, `library`, `settings`, `playlists`, `smart-playlist`, `favorites`,
`browse`, `profile`, `subflow`.

Note: several journeys (`navigation`, `home`, `radio`, `search`, `library-search`,
`album-actions`, `artist`, `profile`) use the Android-only `back` command to move
between screens (the app primarily targets Android). The write-path flows all
clean up after themselves on the shared demo server: `playlists.yaml` and
`smart-playlist.yaml` each create then delete the playlist they make, and
`favorite-toggle.yaml` stars a track then un-stars it (each tap confirmed by its
own toast). `queue-management.yaml` clears the (local) playback queue and only
*opens* the create-from-queue dialog before cancelling, so it never writes a
playlist; `album-actions.yaml` opens the Add-to-playlist picker but backs out
without selecting one.
Conditional `runFlow`s keep server-dependent steps no-ops where unsupported: the
`Shares` destination in `navigation.yaml` (server sharing capability), the
`Edit` step in `profile.yaml` (Navidrome-owner profile editing), and the whole
body of `smart-playlist.yaml` (Navidrome-only smart-playlist capability).
`radio.yaml` drives the live Radio Browser API but asserts only that the search
input accepts the query, not which stations return.
