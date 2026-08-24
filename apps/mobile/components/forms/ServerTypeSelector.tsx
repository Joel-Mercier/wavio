import LibraryIcon from "lucide-react-native/dist/esm/icons/library.mjs";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import ServerTypeIcon from "@/components/ServerTypeIcon";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { isSmbAvailable } from "@/modules/smb";
import { isIndexBackedType } from "@/services/backend/serverTraits";
import type { ServerType } from "@/stores/servers";

interface ServerTypeSelectorProps {
  value: ServerType;
  onChange: (next: ServerType) => void;
  /**
   * Whether the on-device library is one of the library tabs. It is a singleton
   * (fixed `local` URL + scope), so the server list hides it once one exists;
   * the share tabs stay either way.
   */
  includeLocal?: boolean;
}

/**
 * Picks which backend a server talks to: a tile per remote protocol, plus one
 * "My library" tile covering the index-backed types.
 *
 * Folders on this device and network file shares are the same thing from the
 * user's side — a library Wavio indexes itself — so they share a tile and split
 * into tabs once picked, rather than growing the grid a button per protocol.
 * The value stays the real `ServerType` throughout, so callers key off it as
 * they always have.
 */
export default function ServerTypeSelector({
  value,
  onChange,
  includeLocal = true,
}: ServerTypeSelectorProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];

  const libraryTabs: { value: ServerType; label: string }[] = [
    ...(includeLocal
      ? [
          {
            value: "local" as ServerType,
            label: t("auth.login.libraryTabLocal"),
          },
        ]
      : []),
    // SMB needs the native module, which isn't there on web or in Expo Go —
    // offering it then would let someone create a server that can never load a
    // track.
    ...(isSmbAvailable()
      ? [{ value: "smb" as ServerType, label: t("auth.login.serverTypeSmb") }]
      : []),
    { value: "webdav", label: t("auth.login.serverTypeWebdav") },
  ];

  // Which tab the "My library" tile reopens on: the three index-backed types
  // share one tile, so the tile alone doesn't say which of them is meant.
  const [libraryType, setLibraryType] = useState<ServerType>(() =>
    isIndexBackedType(value) ? value : libraryTabs[0].value,
  );
  // Follow the value when it is set from outside (picking a saved server on the
  // login screen), so the tab bar opens on that server's protocol.
  useEffect(() => {
    if (isIndexBackedType(value)) setLibraryType(value);
  }, [value]);

  const selectLibraryType = (next: ServerType) => {
    setLibraryType(next);
    onChange(next);
  };

  const remoteTypeOptions: { value: ServerType; label: string }[] = [
    { value: "navidrome", label: t("auth.login.serverTypeNavidrome") },
    { value: "opensubsonic", label: t("auth.login.serverTypeOpenSubsonic") },
    { value: "jellyfin", label: t("auth.login.serverTypeJellyfin") },
  ];

  const tiles: {
    key: string;
    label: string;
    icon: ReactNode;
    selected: boolean;
    onPress: () => void;
  }[] = [
    ...remoteTypeOptions.map((opt) => ({
      key: opt.value,
      label: opt.label,
      icon: <ServerTypeIcon type={opt.value} size={28} />,
      selected: value === opt.value,
      onPress: () => onChange(opt.value),
    })),
    {
      key: "library",
      label: t("auth.login.serverTypeLibrary"),
      icon: <LibraryIcon size={28} color={white} />,
      selected: isIndexBackedType(value),
      onPress: () => onChange(libraryType),
    },
  ];
  // Two per row: a single row leaves no room for a readable label.
  const rows: [(typeof tiles)[number], (typeof tiles)[number]?][] = [];
  for (let i = 0; i < tiles.length; i += 2) {
    rows.push([tiles[i], tiles[i + 1]]);
  }

  return (
    <VStack className="gap-y-4">
      {rows.map(([a, b]) => (
        <HStack key={a.key} className="gap-x-4">
          {[a, b].map((tile) => {
            if (!tile) return null;
            return (
              <FadeOutScaleDown
                key={tile.key}
                onPress={tile.onPress}
                className="flex-1"
              >
                <HStack
                  className={`items-center rounded-md bg-primary-600 border-2 py-3 px-3 gap-x-3 ${
                    tile.selected ? "border-emerald-500" : "border-primary-600"
                  }`}
                >
                  {tile.icon}
                  <Text
                    className="text-sm text-white font-bold flex-1"
                    numberOfLines={2}
                  >
                    {tile.label}
                  </Text>
                </HStack>
              </FadeOutScaleDown>
            );
          })}
        </HStack>
      ))}
      {isIndexBackedType(value) && (
        // No padding around the segments: the active one has to reach the
        // container's edges for its outer corners to sit on the same radius.
        <HStack className="rounded-md bg-primary-600">
          {libraryTabs.map((tab, index) => {
            const active = value === tab.value;
            const first = index === 0;
            const last = index === libraryTabs.length - 1;
            return (
              <FadeOutScaleDown
                key={tab.value}
                onPress={() => selectLibraryType(tab.value)}
                className="flex-1"
              >
                <Box
                  className={`items-center justify-center py-3 px-2 ${
                    first ? "rounded-l-md" : ""
                  } ${last ? "rounded-r-md" : ""} ${
                    active ? "bg-emerald-500" : ""
                  }`}
                >
                  <Text
                    className={`text-sm font-bold ${
                      active ? "text-primary-800" : "text-primary-100"
                    }`}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </Box>
              </FadeOutScaleDown>
            );
          })}
        </HStack>
      )}
    </VStack>
  );
}
