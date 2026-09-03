import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import CombinatorToggle from "@/components/smartPlaylist/CombinatorToggle";
import RuleConnector from "@/components/smartPlaylist/RuleConnector";
import RuleRow from "@/components/smartPlaylist/RuleRow";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  defaultRule,
  type FormNode,
  type FormRuleGroup,
  isRuleGroup,
} from "@/utils/smartPlaylist";

interface RuleGroupCardProps {
  group: FormRuleGroup;
  onChange: (group: FormRuleGroup) => void;
  onRemove: () => void;
  serverVersion: string | null;
}

export default function RuleGroupCard({
  group,
  onChange,
  onRemove,
  serverVersion,
}: RuleGroupCardProps) {
  const { t } = useTranslation();
  const [red400] = Uniwind.getCSSVariable(["--color-red-400"]) as string[];

  const updateNode = (i: number, next: FormNode) => {
    onChange({
      ...group,
      rules: group.rules.map((n, idx) => (idx === i ? next : n)),
    });
  };
  // Only ever removes the child: collapsing the group when it empties would
  // cascade into every enclosing group, since onRemove is the parent's removeNode.
  const removeNode = (i: number) => {
    onChange({ ...group, rules: group.rules.filter((_, idx) => idx !== i) });
  };
  const addRule = () => {
    onChange({ ...group, rules: [...group.rules, defaultRule()] });
  };

  return (
    <Box className="bg-primary-700 rounded-md p-3 mb-3">
      <Box className="mb-3">
        <CombinatorToggle
          combinator={group.combinator}
          onCombinatorChange={(c) => onChange({ ...group, combinator: c })}
          className="bg-primary-600"
        />
      </Box>
      <VStack>
        {group.rules.map((node, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable per index
          <Box key={i}>
            {i > 0 && <RuleConnector combinator={group.combinator} />}
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
      <HStack className="items-center justify-between flex-wrap">
        <FadeOutScaleDown onPress={addRule}>
          <HStack className="items-center gap-x-2 py-2">
            <Plus size={18} color="#10b981" />
            <Text className="text-emerald-500 font-bold">
              {t("app.smartPlaylist.addRule")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
        <FadeOutScaleDown onPress={onRemove}>
          <HStack className="items-center gap-x-2 py-2">
            <X size={18} color={red400} />
            <Text className="text-red-400 font-bold">
              {t("app.smartPlaylist.deleteGroup")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      </HStack>
    </Box>
  );
}
