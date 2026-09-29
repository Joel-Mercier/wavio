const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

// Icons for the optional buttons of the media notification, which the expo-audio
// patch looks up by name (AudioControlsService.customIconResId). media3's own
// Material Symbols glyphs fill their 24dp box, while the system draws previous /
// next at roughly half of it, so beside those they read oversized. These are the
// same paths (media3 1.9.0, Apache 2.0) shrunk around the centre until the heart
// matches the previous / next glyphs.
const SCALE = 0.66;

const ICONS = {
  media_control_heart_filled:
    "M480,840L422,788Q321,697 255,631Q189,565 150,512.5Q111,460 95.5,416Q80,372 80,326Q80,232 143,169Q206,106 300,106Q352,106 399,128Q446,150 480,190Q514,150 561,128Q608,106 660,106Q754,106 817,169Q880,232 880,326Q880,372 864.5,416Q849,460 810,512.5Q771,565 705,631Q639,697 538,788L480,840Z",
  media_control_heart_unfilled:
    "M480,840L422,788Q321,697 255,631Q189,565 150,512.5Q111,460 95.5,416Q80,372 80,326Q80,232 143,169Q206,106 300,106Q352,106 399,128Q446,150 480,190Q514,150 561,128Q608,106 660,106Q754,106 817,169Q880,232 880,326Q880,372 864.5,416Q849,460 810,512.5Q771,565 705,631Q639,697 538,788L480,840ZM480,732Q576,646 638,584.5Q700,523 736,477.5Q772,432 786,396.5Q800,361 800,326Q800,266 760,226Q720,186 660,186Q613,186 573,212.5Q533,239 518,280L442,280Q427,239 387,212.5Q347,186 300,186Q240,186 200,226Q160,266 160,326Q160,361 174,396.5Q188,432 224,477.5Q260,523 322,584.5Q384,646 480,732Z",
  media_control_skip_back_10:
    "M480,880Q405,880 339.5,851.5Q274,823 225.5,774.5Q177,726 148.5,660.5Q120,595 120,520L200,520Q200,637 281.5,718.5Q363,800 480,800Q597,800 678.5,718.5Q760,637 760,520Q760,403 678.5,321.5Q597,240 480,240L474,240L536,302L480,360L320,200L480,40L536,98L474,160L480,160Q555,160 620.5,188.5Q686,217 734.5,265.5Q783,314 811.5,379.5Q840,445 840,520Q840,595 811.5,660.5Q783,726 734.5,774.5Q686,823 620.5,851.5Q555,880 480,880ZM360,640L360,460L300,460L300,400L420,400L420,640L360,640ZM500,640Q483,640 471.5,628.5Q460,617 460,600L460,440Q460,423 471.5,411.5Q483,400 500,400L580,400Q597,400 608.5,411.5Q620,423 620,440L620,600Q620,617 608.5,628.5Q597,640 580,640L500,640ZM520,580L560,580L560,460L520,460L520,580Z",
  media_control_skip_forward_10:
    "M360,640L360,460L300,460L300,400L420,400L420,640L360,640ZM500,640Q483,640 471.5,628.5Q460,617 460,600L460,440Q460,423 471.5,411.5Q483,400 500,400L580,400Q597,400 608.5,411.5Q620,423 620,440L620,600Q620,617 608.5,628.5Q597,640 580,640L500,640ZM520,580L560,580L560,460L520,460L520,580ZM480,880Q405,880 339.5,851.5Q274,823 225.5,774.5Q177,726 148.5,660.5Q120,595 120,520Q120,445 148.5,379.5Q177,314 225.5,265.5Q274,217 339.5,188.5Q405,160 480,160L486,160L424,98L480,40L640,200L480,360L424,302L486,240L480,240Q363,240 281.5,321.5Q200,403 200,520Q200,637 281.5,718.5Q363,800 480,800Q597,800 678.5,718.5Q760,637 760,520L840,520Q840,595 811.5,660.5Q783,726 734.5,774.5Q686,823 620.5,851.5Q555,880 480,880Z",
};

const vector = (pathData) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="960"
    android:viewportHeight="960">
  <group
      android:pivotX="480"
      android:pivotY="480"
      android:scaleX="${SCALE}"
      android:scaleY="${SCALE}">
    <path
        android:fillColor="@android:color/white"
        android:pathData="${pathData}"/>
  </group>
</vector>
`;

const withMediaControlIcons = (config) =>
  withDangerousMod(config, [
    "android",
    async (cfg) => {
      const drawableDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "drawable",
      );
      fs.mkdirSync(drawableDir, { recursive: true });
      for (const [name, pathData] of Object.entries(ICONS)) {
        fs.writeFileSync(
          path.join(drawableDir, `${name}.xml`),
          vector(pathData),
        );
      }
      return cfg;
    },
  ]);

module.exports = withMediaControlIcons;
