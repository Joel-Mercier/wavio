package expo.modules.wearbridge

/**
 * Mirror of the path constants in services/wear/protocol.ts, which is the
 * source of truth. Only paths live here — payload shapes deliberately do not,
 * because this module is a dumb pipe: it moves JSON strings between JS and the
 * Data Layer and never inspects them (the single exception is `artworkKey`,
 * which it needs to decide whether the bitmap has to be re-sent).
 */
internal object WearPaths {
  const val STATE = "/wavio/v1/state"
  const val QUEUE = "/wavio/v1/queue"
  const val ARTWORK = "/wavio/v1/artwork"
  const val COMMAND = "/wavio/v1/command"
  const val PROGRESS = "/wavio/v1/progress"

  const val CAPABILITY_WATCH = "wavio_watch"

  /** DataMap key holding the JSON payload of a state/queue/artwork item. */
  const val KEY_JSON = "json"
  const val KEY_ARTWORK_KEY = "key"
  const val ASSET_ARTWORK = "artwork"
}
