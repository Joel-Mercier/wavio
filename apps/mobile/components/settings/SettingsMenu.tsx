import type { Href } from "expo-router";
import Archive from "lucide-react-native/dist/esm/icons/archive.mjs";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import CloudDownload from "lucide-react-native/dist/esm/icons/cloud-download.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import HardDrive from "lucide-react-native/dist/esm/icons/hard-drive.mjs";
import Library from "lucide-react-native/dist/esm/icons/library.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/mic-signal.mjs";
import Palette from "lucide-react-native/dist/esm/icons/palette.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import RefreshCw from "lucide-react-native/dist/esm/icons/refresh-cw.mjs";
import ShieldCheck from "lucide-react-native/dist/esm/icons/shield-check.mjs";
import Workflow from "lucide-react-native/dist/esm/icons/workflow.mjs";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import SettingsLinkRow from "@/components/settings/SettingsLinkRow";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";
import { useCapabilities } from "@/hooks/useCapabilities";
import type { BackendCapabilities } from "@/services/backend/capabilities";
import {
  filesAreOnDeviceType,
  isIndexBackedType,
} from "@/services/backend/serverTraits";
import { useAuthBase } from "@/stores/auth";

type IconProps = { size?: number; color?: string };

const MENU_ENTRIES: {
  key: string;
  icon: ComponentType<IconProps>;
  // Hidden when the library's files already sit on this device, so there is
  // nothing to download.
  hideWhenFilesOnDevice?: boolean;
  // Hidden unless the active backend advertises this capability, so a section
  // never opens onto features the server can't honour.
  requiresCapability?: keyof BackendCapabilities;
  // For the one section whose contents aren't a single capability. Same purpose
  // as the two flags above: never offer a row that opens onto an empty screen.
  isEmpty?: (ctx: {
    capabilities: BackendCapabilities;
    indexBacked: boolean;
  }) => boolean;
}[] = [
  { key: "playback", icon: AudioLines },
  { key: "library", icon: Library },
  { key: "downloads", icon: Download, hideWhenFilesOnDevice: true },
  { key: "appearance", icon: Palette },
  { key: "podcasts", icon: Podcast },
  { key: "radio", icon: Radio },
  { key: "storage", icon: HardDrive },
  { key: "downloaders", icon: CloudDownload, hideWhenFilesOnDevice: true },
  // No single capability covers this one — the section decides per integration
  // (MusicBrainz needs tag writing, AudioMuse-AI needs a remote media server),
  // so the rule here mirrors IntegrationsSection's own two conditions. A network
  // file share satisfies neither, which used to open the entry onto a screen
  // holding nothing but its description.
  {
    key: "integrations",
    icon: Workflow,
    isEmpty: ({ capabilities, indexBacked }) =>
      !capabilities.tagWriting && indexBacked,
  },
  { key: "backup", icon: Archive },
  { key: "security", icon: ShieldCheck },
  { key: "updates", icon: RefreshCw },
];

export default function SettingsMenu() {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  // A library whose files are already on this device reads straight off the
  // filesystem: offline downloads don't apply, so those entries are hidden.
  const filesOnDevice = useAuthBase((store) =>
    filesAreOnDeviceType(store.serverType),
  );
  const indexBacked = useAuthBase((store) =>
    isIndexBackedType(store.serverType),
  );
  const capabilities = useCapabilities();

  return (
    <SettingsScreenScaffold title={t("app.settings.title")}>
      <VStack>
        {MENU_ENTRIES.filter(
          (entry) =>
            !(entry.hideWhenFilesOnDevice && filesOnDevice) &&
            (!entry.requiresCapability ||
              capabilities[entry.requiresCapability]) &&
            !entry.isEmpty?.({ capabilities, indexBacked }),
        ).map((entry) => {
          const Icon = entry.icon;
          return (
            <SettingsLinkRow
              key={entry.key}
              icon={<Icon size={24} color={white} />}
              title={t(`app.settings.menu.${entry.key}.title`)}
              description={t(`app.settings.menu.${entry.key}.description`)}
              href={`/settings/${entry.key}` as Href}
            />
          );
        })}
      </VStack>
    </SettingsScreenScaffold>
  );
}
