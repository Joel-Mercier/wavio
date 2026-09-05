import FolderPlus from "lucide-react-native/dist/esm/icons/folder-plus.mjs";
import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import CombinatorToggle from "@/components/smartPlaylist/CombinatorToggle";
import RuleConnector from "@/components/smartPlaylist/RuleConnector";
import RuleGroupCard from "@/components/smartPlaylist/RuleGroupCard";
import RuleRow from "@/components/smartPlaylist/RuleRow";
import SortEditor from "@/components/smartPlaylist/SortEditor";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ChevronDownIcon } from "@/components/ui/icon";
import { Input, InputField } from "@/components/ui/input";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { supportsRefreshDelay } from "@/utils/navidromeVersion";
import {
  defaultRule,
  defaultRuleGroup,
  type FormNode,
  type FormSortEntry,
  isRuleGroup,
  REFRESH_DELAY_PRESETS,
} from "@/utils/smartPlaylist";

// "" (server default) can't be a Select value — the empty string reads as
// "nothing selected" — so the picker speaks in this sentinel instead.
const REFRESH_DELAY_DEFAULT = "default";

interface RuleEditorProps {
  combinator: "all" | "any";
  onCombinatorChange: (c: "all" | "any") => void;
  rules: FormNode[];
  onRulesChange: (r: FormNode[]) => void;
  sorts: FormSortEntry[];
  onSortsChange: (s: FormSortEntry[]) => void;
  limit: string;
  onLimitChange: (s: string) => void;
  refreshDelay: string;
  onRefreshDelayChange: (s: string) => void;
  serverVersion: string | null;
}

export default function RuleEditor({
  combinator,
  onCombinatorChange,
  rules,
  onRulesChange,
  sorts,
  onSortsChange,
  limit,
  onLimitChange,
  refreshDelay,
  onRefreshDelayChange,
  serverVersion,
}: RuleEditorProps) {
  const { t } = useTranslation();
  // A delay authored elsewhere ("1d12h") isn't one of ours, but it must stay
  // selectable or saving from here would silently round it to the default.
  const refreshDelayValues: string[] = [
    ...REFRESH_DELAY_PRESETS.map((v) => v || REFRESH_DELAY_DEFAULT),
    ...(refreshDelay &&
    !REFRESH_DELAY_PRESETS.includes(
      refreshDelay as (typeof REFRESH_DELAY_PRESETS)[number],
    )
      ? [refreshDelay]
      : []),
  ];
  const refreshDelayLabel = (value: string) =>
    value === REFRESH_DELAY_DEFAULT
      ? t("app.smartPlaylist.refreshDelayOptions.default")
      : t(`app.smartPlaylist.refreshDelayOptions.${value}`, {
          defaultValue: value,
        });

  const updateNode = (i: number, next: FormNode) => {
    onRulesChange(rules.map((n, idx) => (idx === i ? next : n)));
  };
  const removeNode = (i: number) => {
    onRulesChange(rules.filter((_, idx) => idx !== i));
  };
  const addRule = () => {
    onRulesChange([...rules, defaultRule()]);
  };
  const addGroup = () => {
    onRulesChange([...rules, defaultRuleGroup()]);
  };

  return (
    <VStack className="gap-y-4">
      <CombinatorToggle
        combinator={combinator}
        onCombinatorChange={onCombinatorChange}
      />

      <VStack>
        {rules.map((node, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable per index
          <Box key={i}>
            {i > 0 && <RuleConnector combinator={combinator} />}
            {isRuleGroup(node) ? (
              <RuleGroupCard
                group={node}
                onChange={(next) => updateNode(i, next)}
                onRemove={() => removeNode(i)}
                serverVersion={serverVersion}
              />
            ) : (
              <RuleRow
                rule={node}
                onChange={(next) => updateNode(i, next)}
                onRemove={() => removeNode(i)}
                serverVersion={serverVersion}
              />
            )}
          </Box>
        ))}
      </VStack>

      <HStack className="items-center gap-x-6 flex-wrap">
        <FadeOutScaleDown onPress={addRule}>
          <HStack className="items-center gap-x-2 py-2">
            <Plus size={18} color="#10b981" />
            <Text className="text-emerald-500 font-bold">
              {t("app.smartPlaylist.addRule")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={addGroup}>
          <HStack className="items-center gap-x-2 py-2">
            <FolderPlus size={18} color="#10b981" />
            <Text className="text-emerald-500 font-bold">
              {t("app.smartPlaylist.addGroup")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      </HStack>

      <Box className="h-px bg-primary-600 my-2" />

      <SortEditor
        sorts={sorts}
        onChange={onSortsChange}
        serverVersion={serverVersion}
      />

      <VStack className="gap-y-2">
        <Text className="text-primary-100 text-xs uppercase">
          {t("app.smartPlaylist.limit")}
        </Text>
        <Input className="bg-primary-600 border-0 rounded-md px-4">
          <InputField
            value={limit}
            onChangeText={onLimitChange}
            className="text-md text-white"
            placeholder={t("app.smartPlaylist.limitPlaceholder")}
            keyboardType="numeric"
          />
        </Input>
      </VStack>

      {supportsRefreshDelay(serverVersion) && (
        <VStack className="gap-y-2">
          <Text className="text-primary-100 text-xs uppercase">
            {t("app.smartPlaylist.refreshDelay")}
          </Text>
          <Select
            selectedValue={refreshDelay || REFRESH_DELAY_DEFAULT}
            onValueChange={(v) =>
              onRefreshDelayChange(v === REFRESH_DELAY_DEFAULT ? "" : v)
            }
          >
            <SelectTrigger className="bg-primary-600 border-0 rounded-md px-4 py-2">
              <SelectInput
                value={refreshDelayLabel(refreshDelay || REFRESH_DELAY_DEFAULT)}
                className="text-md text-white"
              />
              <SelectIcon as={ChevronDownIcon} />
            </SelectTrigger>
            <SelectPortal>
              <SelectBackdrop />
              <SelectContent className="bg-primary-700">
                <SelectDragIndicatorWrapper>
                  <SelectDragIndicator />
                </SelectDragIndicatorWrapper>
                <SelectScrollView>
                  <Box className="p-6 w-full mb-12">
                    {refreshDelayValues.map((value) => (
                      <SelectItem
                        key={value}
                        value={value}
                        label={refreshDelayLabel(value)}
                      />
                    ))}
                  </Box>
                </SelectScrollView>
              </SelectContent>
            </SelectPortal>
          </Select>
          <Text className="text-primary-100 text-xs">
            {t("app.smartPlaylist.refreshDelayHint")}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}
