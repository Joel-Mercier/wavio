import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
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
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  defaultRule,
  type FormRule,
  getAvailableFields,
  getFieldByKey,
  getOperatorsForField,
  isTagPresenceOperator,
  type RuleOperator,
} from "@/utils/smartPlaylist";

interface RuleRowProps {
  rule: FormRule;
  onChange: (rule: FormRule) => void;
  onRemove: () => void;
  serverVersion: string | null;
}

export default function RuleRow({
  rule,
  onChange,
  onRemove,
  serverVersion,
}: RuleRowProps) {
  const { t } = useTranslation();
  const [gray200, gray400, red400] = Uniwind.getCSSVariable([
    "--color-gray-200",
    "--color-gray-400",
    "--color-red-400",
  ]) as string[];
  const fields = getAvailableFields(serverVersion);
  const field = getFieldByKey(rule.field) ?? getFieldByKey("title");
  if (!field) return null;
  const operators = getOperatorsForField(field, serverVersion);

  const handleFieldChange = (key: string) => {
    const next = getFieldByKey(key);
    if (!next) return;
    const validOps = getOperatorsForField(next, serverVersion);
    const baseRule = defaultRule();
    onChange({
      ...baseRule,
      field: key,
      operator: validOps[0] as RuleOperator,
    });
  };

  const handleOperatorChange = (op: string) => {
    onChange({ ...rule, operator: op as RuleOperator });
  };

  const isRange = rule.operator === "inTheRange";
  const isTagPresence = isTagPresenceOperator(rule.operator);

  return (
    <Box className="border border-primary-600 rounded-md p-3 mb-3">
      <HStack className="items-center justify-between mb-3">
        <Text className="text-primary-100 text-xs uppercase">
          {t("app.smartPlaylist.rule")}
        </Text>
        <FadeOutScaleDown onPress={onRemove}>
          <X size={18} color={red400} />
        </FadeOutScaleDown>
      </HStack>
      <VStack className="gap-y-3">
        <Select selectedValue={rule.field} onValueChange={handleFieldChange}>
          <SelectTrigger className="bg-primary-600 border-0 rounded-md px-4 py-2">
            <SelectInput
              value={t(`app.smartPlaylist.fields.${field.i18nKey}`)}
              className="text-md text-white"
              placeholderTextColor={gray400}
            />
            <SelectIcon as={ChevronDownIcon} />
          </SelectTrigger>
          <SelectPortal snapPoints={[60]}>
            <SelectBackdrop />
            <SelectContent className="bg-primary-700">
              <SelectDragIndicatorWrapper>
                <SelectDragIndicator />
              </SelectDragIndicatorWrapper>
              <SelectScrollView>
                <Box className="p-6 w-full mb-12">
                  {fields.map((f) => (
                    <SelectItem
                      key={f.key}
                      value={f.key}
                      label={t(`app.smartPlaylist.fields.${f.i18nKey}`)}
                    />
                  ))}
                </Box>
              </SelectScrollView>
            </SelectContent>
          </SelectPortal>
        </Select>

        <Select
          selectedValue={rule.operator}
          onValueChange={handleOperatorChange}
        >
          <SelectTrigger className="bg-primary-600 border-0 rounded-md px-4 py-2">
            <SelectInput
              value={t(`app.smartPlaylist.operators.${rule.operator}`)}
              className="text-md text-white"
              placeholderTextColor={gray400}
            />
            <SelectIcon as={ChevronDownIcon} />
          </SelectTrigger>
          <SelectPortal snapPoints={[50]}>
            <SelectBackdrop />
            <SelectContent className="bg-primary-700">
              <SelectDragIndicatorWrapper>
                <SelectDragIndicator />
              </SelectDragIndicatorWrapper>
              <SelectScrollView>
                <Box className="p-6 w-full mb-12">
                  {operators.map((op) => (
                    <SelectItem
                      key={op}
                      value={op}
                      label={t(`app.smartPlaylist.operators.${op}`)}
                    />
                  ))}
                </Box>
              </SelectScrollView>
            </SelectContent>
          </SelectPortal>
        </Select>

        {field.valueType === "boolean" || isTagPresence ? (
          <HStack className="items-center justify-between px-2">
            <Text className="text-white">
              {t("app.smartPlaylist.boolValue")}
            </Text>
            <Switch
              value={rule.boolValue}
              onValueChange={(v) => onChange({ ...rule, boolValue: v })}
            />
          </HStack>
        ) : field.valueType === "playlist" ? (
          <Input className="bg-primary-600 border-0 rounded-md px-4">
            <InputField
              value={rule.playlistId}
              onChangeText={(v) => onChange({ ...rule, playlistId: v })}
              className="text-md text-white"
              placeholder={t("app.smartPlaylist.playlistIdPlaceholder")}
              placeholderTextColor={gray400}
            />
          </Input>
        ) : isRange ? (
          <HStack className="gap-x-3">
            <Input className="flex-1 bg-primary-600 border-0 rounded-md px-4">
              <InputField
                value={rule.value}
                onChangeText={(v) => onChange({ ...rule, value: v })}
                className="text-md text-white"
                placeholder={t("app.smartPlaylist.rangeMin")}
                placeholderTextColor={gray400}
                keyboardType="numeric"
              />
            </Input>
            <Input className="flex-1 bg-primary-600 border-0 rounded-md px-4">
              <InputField
                value={rule.valueMax}
                onChangeText={(v) => onChange({ ...rule, valueMax: v })}
                className="text-md text-white"
                placeholder={t("app.smartPlaylist.rangeMax")}
                placeholderTextColor={gray400}
                keyboardType="numeric"
              />
            </Input>
          </HStack>
        ) : (
          <Input className="bg-primary-600 border-0 rounded-md px-4">
            <InputField
              value={rule.value}
              onChangeText={(v) => onChange({ ...rule, value: v })}
              className="text-md text-white"
              placeholder={t("app.smartPlaylist.valuePlaceholder")}
              placeholderTextColor={gray400}
              keyboardType={
                field.valueType === "integer" ||
                field.valueType === "decimal" ||
                field.valueType === "rating" ||
                rule.operator === "inTheLast" ||
                rule.operator === "notInTheLast"
                  ? "numeric"
                  : "default"
              }
            />
          </Input>
        )}
      </VStack>
    </Box>
  );
}
