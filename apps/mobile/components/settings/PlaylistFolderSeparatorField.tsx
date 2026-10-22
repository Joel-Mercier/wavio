import { useState } from "react";
import { useTranslation } from "react-i18next";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Heading } from "@/components/ui/heading";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

export const separatorExample = (separator: string) => `Rock${separator}80s`;

// Committed on an explicit press: every keystroke would regroup the library
// around a half-typed separator.
export default function PlaylistFolderSeparatorField({
  value,
  onSave,
}: {
  value: string;
  onSave: (separator: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const valid = draft.trim().length > 0;
  const dirty = draft !== value;

  return (
    <VStack className="gap-y-2 py-2">
      <Heading className="text-white font-normal" size="sm">
        {t("app.settings.libraryDisplaySettings.separatorCustomLabel")}
      </Heading>
      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
        <InputField
          value={draft}
          onChangeText={setDraft}
          className="text-md text-white"
          placeholder={t(
            "app.settings.libraryDisplaySettings.separatorCustomPlaceholder",
          )}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Input>
      <HStack className="items-center justify-between gap-x-4">
        <Text className="text-primary-300 text-xs shrink">
          {valid
            ? t("app.settings.libraryDisplaySettings.separatorPreview", {
                example: separatorExample(draft),
              })
            : null}
        </Text>
        {dirty && valid ? (
          <FadeOutScaleDown
            onPress={() => onSave(draft)}
            className="items-center justify-center py-2 px-6 border border-emerald-500 bg-emerald-500 rounded-full"
          >
            <Text className="text-primary-800 font-bold text-sm">
              {t("app.settings.libraryDisplaySettings.separatorSaveAction")}
            </Text>
          </FadeOutScaleDown>
        ) : null}
      </HStack>
    </VStack>
  );
}
