import GripVertical from "lucide-react-native/icons/grip-vertical";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type AnimatedRef,
  type SharedValue,
  useAnimatedRef,
  useScrollOffset,
} from "react-native-reanimated";
import { Uniwind } from "uniwind";
import SortableColumn from "@/components/SortableColumn";
import {
  SettingsSectionTitle,
  SettingsSelectRow,
  SettingsToggleRow,
} from "@/components/settings/SettingsRows";
import SettingsScreenScaffold from "@/components/settings/SettingsScreenScaffold";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { useScreenBottomPadding } from "@/hooks/useScreenBottomPadding";
import { ROW_KEYS } from "@/services/carAuto/mediaId";
import type { ItemAction } from "@/services/carAuto/types";
import useCarAuto, {
  type CarDisplayTarget,
  type CarPlayerButton,
  LIBRARY_SECTIONS,
  PLAYER_BUTTONS,
  TAB_SECTIONS,
} from "@/stores/carAuto";
import { cn } from "@/utils/tailwind";

const DISPLAY_TARGETS: CarDisplayTarget[] = [
  "albums",
  "playlists",
  "artists",
  "genres",
];

const LIST_ACTIONS: ItemAction[] = [
  "favoriteAdd",
  "radio",
  "playNext",
  "addToQueue",
  "shuffle",
  "download",
];

function OrderedToggleList<T extends string>({
  all,
  selected,
  onChange,
  label,
  scroll,
}: {
  all: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  label: (key: T) => string;
  scroll: ReorderScroll;
}) {
  const [white, gray400, gray500, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-400",
    "--color-gray-500",
    "--color-emerald-500",
  ]) as string[];
  const rows = [...selected, ...all.filter((key) => !selected.includes(key))];

  const sort = (fromIndex: number, toIndex: number) => {
    const next = [...selected];
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) return;
    next.splice(toIndex, 0, moved);
    onChange(next);
  };

  const toggle = (key: T, enabled: boolean) =>
    onChange(
      enabled ? [...selected, key] : selected.filter((item) => item !== key),
    );

  const renderRow = (key: T, _index: number, isActive: boolean) => {
    const enabled = selected.includes(key);
    return (
      <HStack
        className={cn("items-center gap-x-3 py-3", {
          "bg-primary-600 rounded-md": isActive,
        })}
      >
        {enabled ? (
          <GripVertical size={18} color={gray400} />
        ) : (
          <Box className="w-[18px]" />
        )}
        <Text className="flex-1 text-white text-base" numberOfLines={1}>
          {label(key)}
        </Text>
        <Switch
          size="md"
          trackColor={{ false: gray500, true: emerald500 }}
          thumbColor={white}
          value={enabled}
          onToggle={(value: boolean) => toggle(key, value)}
        />
      </HStack>
    );
  };

  return (
    <SortableColumn
      data={rows}
      sortableCount={selected.length}
      keyExtractor={(key) => key}
      renderItem={renderRow}
      onSort={sort}
      scrollRef={scroll.ref}
      scrollOffset={scroll.offset}
      bottomInset={scroll.bottomInset}
      onDragStateChange={scroll.onDragStateChange}
    />
  );
}

type ReorderScroll = {
  ref: AnimatedRef<never>;
  offset: SharedValue<number>;
  bottomInset: number;
  onDragStateChange: (dragging: boolean) => void;
};

export default function AndroidAutoSection() {
  const { t } = useTranslation();
  const tabs = useCarAuto((s) => s.tabs);
  const setTabs = useCarAuto((s) => s.setTabs);
  const homeRows = useCarAuto((s) => s.homeRows);
  const setHomeRows = useCarAuto((s) => s.setHomeRows);
  const libraryEntries = useCarAuto((s) => s.libraryEntries);
  const setLibraryEntries = useCarAuto((s) => s.setLibraryEntries);
  const displayStyles = useCarAuto((s) => s.displayStyles);
  const setDisplayStyle = useCarAuto((s) => s.setDisplayStyle);
  const collectionTap = useCarAuto((s) => s.collectionTap);
  const setCollectionTap = useCarAuto((s) => s.setCollectionTap);
  const playerButtons = useCarAuto((s) => s.playerButtons);
  const setPlayerButton = useCarAuto((s) => s.setPlayerButton);
  const itemActions = useCarAuto((s) => s.itemActions);
  const setItemAction = useCarAuto((s) => s.setItemAction);

  const scrollRef = useAnimatedRef<never>();
  const scrollOffset = useScrollOffset(scrollRef);
  const bottomInset = useScreenBottomPadding();
  const [dragging, setDragging] = useState(false);
  const scroll: ReorderScroll = {
    ref: scrollRef,
    offset: scrollOffset,
    bottomInset,
    onDragStateChange: setDragging,
  };

  const prefix = "app.settings.androidAutoSettings";
  const section = (key: string) => t(`app.carAuto.sections.${key}`);

  return (
    <SettingsScreenScaffold
      title={t("app.settings.menu.androidAuto.title")}
      scrollRef={scrollRef}
      gestureScroll={{ scrollEnabled: !dragging }}
    >
      <VStack>
        <SettingsSectionTitle title={t(`${prefix}.tabsTitle`)} />
        <Text className="text-primary-100 text-sm">
          {t(`${prefix}.tabsDescription`)}
        </Text>
        <OrderedToggleList
          all={TAB_SECTIONS}
          selected={tabs}
          onChange={setTabs}
          label={section}
          scroll={scroll}
        />

        <SettingsSectionTitle title={t(`${prefix}.homeRowsTitle`)} />
        <OrderedToggleList
          all={ROW_KEYS}
          selected={homeRows}
          onChange={setHomeRows}
          label={(key) => t(`app.carAuto.rows.${key}`)}
          scroll={scroll}
        />

        <SettingsSectionTitle title={t(`${prefix}.libraryTitle`)} />
        <OrderedToggleList
          all={LIBRARY_SECTIONS}
          selected={libraryEntries}
          onChange={setLibraryEntries}
          label={section}
          scroll={scroll}
        />

        <SettingsSectionTitle title={t(`${prefix}.displayTitle`)} />
        {DISPLAY_TARGETS.map((target) => (
          <SettingsSelectRow
            key={target}
            label={section(target)}
            description={t(`${prefix}.displayDescription`)}
            badgeText={t(`${prefix}.display.${displayStyles[target]}`)}
            onPress={() =>
              setDisplayStyle(
                target,
                displayStyles[target] === "grid" ? "list" : "grid",
              )
            }
          />
        ))}
        <SettingsSelectRow
          label={t(`${prefix}.collectionTap.label`)}
          description={t(`${prefix}.collectionTap.description`)}
          badgeText={t(`${prefix}.collectionTap.${collectionTap}`)}
          onPress={() =>
            setCollectionTap(collectionTap === "play" ? "open" : "play")
          }
        />

        <SettingsSectionTitle title={t(`${prefix}.playerButtonsTitle`)} />
        {PLAYER_BUTTONS.map((button: CarPlayerButton) => (
          <SettingsToggleRow
            key={button}
            label={t(`${prefix}.playerButtons.${button}.label`)}
            description={t(`${prefix}.playerButtons.${button}.description`)}
            value={playerButtons[button]}
            onToggle={(value) => setPlayerButton(button, value)}
          />
        ))}

        <SettingsSectionTitle title={t(`${prefix}.itemActionsTitle`)} />
        <Text className="text-primary-100 text-sm">
          {t(`${prefix}.itemActionsDescription`)}
        </Text>
        {LIST_ACTIONS.map((action) => (
          <SettingsToggleRow
            key={action}
            label={t(`${prefix}.itemActions.${action}`)}
            description=""
            value={itemActions[action]}
            onToggle={(value) => setItemAction(action, value)}
          />
        ))}
      </VStack>
    </SettingsScreenScaffold>
  );
}
