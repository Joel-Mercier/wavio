import type { Href } from "expo-router";
import Archive from "lucide-react-native/dist/esm/icons/archive.mjs";
import AudioLines from "lucide-react-native/dist/esm/icons/audio-lines.mjs";
import CloudDownload from "lucide-react-native/dist/esm/icons/cloud-download.mjs";
import Download from "lucide-react-native/dist/esm/icons/download.mjs";
import HardDrive from "lucide-react-native/dist/esm/icons/hard-drive.mjs";
import Library from "lucide-react-native/dist/esm/icons/library.mjs";
import Palette from "lucide-react-native/dist/esm/icons/palette.mjs";
import Podcast from "lucide-react-native/dist/esm/icons/podcast.mjs";
import Radio from "lucide-react-native/dist/esm/icons/radio.mjs";
import ShieldCheck from "lucide-react-native/dist/esm/icons/shield-check.mjs";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import SettingsLinkRow from "@/components/settings/SettingsLinkRow";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { VStack } from "@/components/ui/vstack";
import { useAuthBase } from "@/stores/auth";

type IconProps = { size?: number; color?: string };

const MENU_ENTRIES: {
  key: string;
  icon: ComponentType<IconProps>;
  hideForLocal?: boolean;
}[] = [
  { key: "playback", icon: AudioLines },
  { key: "library", icon: Library },
  { key: "downloads", icon: Download, hideForLocal: true },
  { key: "appearance", icon: Palette },
  { key: "podcasts", icon: Podcast },
  { key: "radio", icon: Radio },
  { key: "storage", icon: HardDrive },
  { key: "downloaders", icon: CloudDownload, hideForLocal: true },
  { key: "backup", icon: Archive },
  { key: "security", icon: ShieldCheck },
];

export default function SettingsMenu() {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  // The on-device library reads straight off the filesystem: offline downloads
  // don't apply, so that entry is hidden for it.
  const isLocal = useAuthBase((store) => store.serverType === "local");

  return (
    <SettingsScreenScaffold title={t("app.settings.title")}>
      <VStack>
        {MENU_ENTRIES.filter((entry) => !(entry.hideForLocal && isLocal)).map(
          (entry) => {
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
          },
        )}
      </VStack>
    </SettingsScreenScaffold>
  );
}
