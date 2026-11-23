package expo.modules.releasepush

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/** Same rules as services/appUpdate/version.ts: only the numeric x.y.z core counts. */
internal object ReleaseVersion {
  private val CORE = Regex("""^v?(\d+)\.(\d+)\.(\d+)""")

  fun parse(input: String?): List<Int>? {
    val match = CORE.find(input?.trim() ?: return null) ?: return null
    return match.groupValues.drop(1).map { it.toIntOrNull() ?: return null }
  }

  fun isNewer(latest: String?, current: String?): Boolean {
    val a = parse(latest) ?: return false
    val b = parse(current) ?: return false
    for (i in a.indices) {
      if (a[i] != b[i]) return a[i] > b[i]
    }
    return false
  }

  fun installed(context: Context): String? =
    try {
      val info =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          context.packageManager.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
        } else {
          @Suppress("DEPRECATION")
          context.packageManager.getPackageInfo(context.packageName, 0)
        }
      info.versionName
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }
}
