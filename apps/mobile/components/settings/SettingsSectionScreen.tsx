import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import AppearanceSection from "@/components/settings/sections/AppearanceSection";
import BackupRestoreSection from "@/components/settings/sections/BackupRestoreSection";
import DownloadersSection from "@/components/settings/sections/DownloadersSection";
import DownloadsOfflineSection from "@/components/settings/sections/DownloadsOfflineSection";
import IntegrationsSection from "@/components/settings/sections/IntegrationsSection";
import InternetRadioSection from "@/components/settings/sections/InternetRadioSection";
import MusicLibrarySection from "@/components/settings/sections/MusicLibrarySection";
import PlaybackAudioSection from "@/components/settings/sections/PlaybackAudioSection";
import PodcastsSection from "@/components/settings/sections/PodcastsSection";
import SecuritySection from "@/components/settings/sections/SecuritySection";
import StorageDataSection from "@/components/settings/sections/StorageDataSection";
import UpdatesSection from "@/components/settings/sections/UpdatesSection";

const SECTIONS: Record<string, React.ComponentType> = {
  playback: PlaybackAudioSection,
  library: MusicLibrarySection,
  downloads: DownloadsOfflineSection,
  downloaders: DownloadersSection,
  integrations: IntegrationsSection,
  appearance: AppearanceSection,
  podcasts: PodcastsSection,
  radio: InternetRadioSection,
  storage: StorageDataSection,
  backup: BackupRestoreSection,
  security: SecuritySection,
  updates: UpdatesSection,
};

export default function SettingsSectionScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const Section = section ? SECTIONS[section] : undefined;

  useEffect(() => {
    if (!Section) {
      router.replace("/settings");
    }
  }, [Section, router]);

  if (!Section) {
    return null;
  }
  return <Section />;
}
