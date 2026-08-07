const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");

const I18N_DIR = path.join(__dirname, "..", "i18n");

// Android resource qualifiers for the locales shipped in i18n/. Anything not
// listed here keeps its bare language code (Crowdin adding `pt.json` just works;
// a new region-qualified locale needs an entry).
const LOCALE_QUALIFIERS = {
  "zh-CN": "zh-rCN",
};

// Reuses the labels already shown on the tab bar and in the drawer, so the
// launcher menu reads exactly like the app it opens.
const LABEL_KEYS = {
  search: ["app", "search", "title"],
  library: ["app", "library", "title"],
  queue: ["app", "shared", "sidebar", "queue"],
};

// Deep links go through app/+native-intent.ts, which maps them onto the real
// routes. Keeping the indirection means a route move is a TS edit, not a
// prebuild.
const SHORTCUTS = [
  { id: "search", uri: "wavio://shortcuts/search" },
  { id: "library", uri: "wavio://shortcuts/library" },
  { id: "queue", uri: "wavio://shortcuts/queue" },
];

// ---------- res/drawable ----------

// Lucide paths (search, library, list-music), scaled into the adaptive-icon safe
// zone: 24 * 2.2 = 52.8 centred in the 108 viewport, comfortably inside the 66
// safe circle. Circles become arcs since vector drawables have no circle tag.
const GLYPHS = {
  search: ["m21 21-4.34-4.34", "M19,11 A8,8 0 1,1 3,11 A8,8 0 1,1 19,11"],
  library: ["m16 6 4 14", "M12 6v14", "M8 8v12", "M4 4v16"],
  queue: [
    "M16 5H3",
    "M11 12H3",
    "M11 19H3",
    "M21 16V5",
    "M21,16 A3,3 0 1,1 15,16 A3,3 0 1,1 21,16",
  ],
};

const glyphDrawable = (paths) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="2.2"
        android:scaleY="2.2"
        android:translateX="27.6"
        android:translateY="27.6">
${paths
  .map(
    (d) => `        <path
            android:fillColor="#00000000"
            android:strokeColor="#10B981"
            android:strokeWidth="2"
            android:strokeLineCap="round"
            android:strokeLineJoin="round"
            android:pathData="${d}" />`,
  )
  .join("\n")}
    </group>
</vector>
`;

const SHORTCUT_BG = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
    android:shape="rectangle">
    <solid android:color="#000000" />
</shape>
`;

const adaptiveIcon = (id) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/shortcut_bg" />
    <foreground android:drawable="@drawable/ic_shortcut_${id}" />
</adaptive-icon>
`;

// ---------- res/xml ----------

const shortcutsXml = (packageName) => `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${SHORTCUTS.map(
  ({ id, uri }) => `    <shortcut
        android:shortcutId="${id}"
        android:enabled="true"
        android:icon="@drawable/shortcut_${id}"
        android:shortcutShortLabel="@string/shortcut_${id}_short"
        android:shortcutLongLabel="@string/shortcut_${id}_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="${packageName}"
            android:targetClass="${packageName}.MainActivity"
            android:data="${uri}" />
    </shortcut>`,
).join("\n")}
</shortcuts>
`;

// ---------- res/values ----------

// Android string resources: a bare apostrophe or quote is an aapt error (fr is
// "File d'attente"), and the file is XML on top of that.
const escapeStringResource = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');

const readLocale = (locale) => {
  const file = path.join(I18N_DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  return json.translation ?? json;
};

const lookup = (tree, keyPath) =>
  keyPath.reduce((node, key) => (node == null ? undefined : node[key]), tree);

const stringsXml = (translations, fallback) => {
  const entries = Object.entries(LABEL_KEYS).flatMap(([id, keyPath]) => {
    const label = lookup(translations, keyPath) ?? lookup(fallback, keyPath);
    if (typeof label !== "string") return [];
    const escaped = escapeStringResource(label);
    return [
      `    <string name="shortcut_${id}_short">${escaped}</string>`,
      `    <string name="shortcut_${id}_long">${escaped}</string>`,
    ];
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<resources>
${entries.join("\n")}
</resources>
`;
};

// ---------- mods ----------

const writeFile = (dir, name, body) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), body);
};

const withShortcutResources = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const resRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const drawableDir = path.join(resRoot, "drawable");

      writeFile(
        path.join(resRoot, "xml"),
        "shortcuts.xml",
        shortcutsXml(cfg.android?.package ?? "com.jmercier.wavio"),
      );

      writeFile(drawableDir, "shortcut_bg.xml", SHORTCUT_BG);
      for (const { id } of SHORTCUTS) {
        writeFile(
          drawableDir,
          `ic_shortcut_${id}.xml`,
          glyphDrawable(GLYPHS[id]),
        );
        writeFile(drawableDir, `shortcut_${id}.xml`, adaptiveIcon(id));
      }

      const english = readLocale("en");
      const locales = fs
        .readdirSync(I18N_DIR)
        .filter((name) => name.endsWith(".json"))
        .map((name) => name.replace(/\.json$/, ""));

      for (const locale of locales) {
        const qualifier = LOCALE_QUALIFIERS[locale] ?? locale;
        writeFile(
          path.join(
            resRoot,
            locale === "en" ? "values" : `values-${qualifier}`,
          ),
          "shortcuts_strings.xml",
          stringsXml(readLocale(locale), english),
        );
      }

      return cfg;
    },
  ]);

// The meta-data belongs on the activity carrying the LAUNCHER intent-filter,
// not on <application> — the launcher reads it off the entry activity.
const withShortcutsMetaData = (config) =>
  withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      cfg.modResults,
    );
    activity["meta-data"] = activity["meta-data"] ?? [];
    const existing = activity["meta-data"].find(
      (m) => m.$["android:name"] === "android.app.shortcuts",
    );
    const node = existing ?? {};
    node.$ = {
      "android:name": "android.app.shortcuts",
      "android:resource": "@xml/shortcuts",
    };
    if (!existing) activity["meta-data"].push(node);
    return cfg;
  });

module.exports = (config) => {
  config = withShortcutResources(config);
  config = withShortcutsMetaData(config);
  return config;
};
