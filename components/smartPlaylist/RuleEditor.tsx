import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RuleRow from "@/components/smartPlaylist/RuleRow";
import SortEditor from "@/components/smartPlaylist/SortEditor";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  defaultRule,
  type FormRule,
  type FormSortEntry,
} from "@/utils/smartPlaylist";

interface RuleEditorProps {
  combinator: "all" | "any";
  onCombinatorChange: (c: "all" | "any") => void;
  rules: FormRule[];
  onRulesChange: (r: FormRule[]) => void;
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

  const updateRule = (i: number, next: FormRule) => {
    onRulesChange(rules.map((r, idx) => (idx === i ? next : r)));
  };
  const removeRule = (i: number) => {
    onRulesChange(rules.filter((_, idx) => idx !== i));
  };
  const addRule = () => {
    onRulesChange([...rules, defaultRule()]);
  };

  return (
    <VStack className="gap-y-4">
      <HStack className="bg-primary-700 rounded-full p-1">
        <FadeOutScaleDown
          onPress={() => onCombinatorChange("all")}
          className={`flex-1 items-center py-2 rounded-full ${combinator === "all" ? "bg-emerald-500" : ""}`}
        >
          <Text
            className={`font-bold ${combinator === "all" ? "text-primary-800" : "text-white"}`}
          >
            {t("app.smartPlaylist.matchAll")}
          </Text>
        </FadeOutScaleDown>
        <FadeOutScaleDown
          onPress={() => onCombinatorChange("any")}
          className={`flex-1 items-center py-2 rounded-full ${combinator === "any" ? "bg-emerald-500" : ""}`}
        >
          <Text
            className={`font-bold ${combinator === "any" ? "text-primary-800" : "text-white"}`}
          >
            {t("app.smartPlaylist.matchAny")}
          </Text>
        </FadeOutScaleDown>
      </HStack>

      <VStack>
        {rules.map((rule, i) => (
          <RuleRow
            // biome-ignore lint/suspicious/noArrayIndexKey: stable per index
            key={i}
            rule={rule}
            onChange={(next) => updateRule(i, next)}
            onRemove={() => removeRule(i)}
          />
        ))}
      </VStack>

      <FadeOutScaleDown onPress={addRule}>
        <HStack className="items-center gap-x-2 py-2">
          <Plus size={18} color="#10b981" />
          <Text className="text-emerald-500 font-bold">
            {t("app.smartPlaylist.addRule")}
          </Text>
        </HStack>
      </FadeOutScaleDown>

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
