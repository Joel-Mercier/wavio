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
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  defaultRule,
  defaultRuleGroup,
  type FormNode,
  type FormSortEntry,
  isRuleGroup,
} from "@/utils/smartPlaylist";

interface RuleEditorProps {
  combinator: "all" | "any";
  onCombinatorChange: (c: "all" | "any") => void;
  rules: FormNode[];
  onRulesChange: (r: FormNode[]) => void;
  sorts: FormSortEntry[];
  onSortsChange: (s: FormSortEntry[]) => void;
  limit: string;
  onLimitChange: (s: string) => void;
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
  serverVersion,
}: RuleEditorProps) {
  const { t } = useTranslation();

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
    </VStack>
  );
}
