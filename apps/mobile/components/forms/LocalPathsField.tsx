import FolderIcon from "lucide-react-native/dist/esm/icons/folder.mjs";
import XIcon from "lucide-react-native/dist/esm/icons/x.mjs";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

interface LocalPathsFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
}

// Editor for the local server's source folders: a text input to add an absolute
// path plus a removable chip list. Used by the login screen when the "Local"
// server type is selected (folders are stored on the server entry — see
// stores/servers.ts `Server.paths`).
export default function LocalPathsField({
  value,
  onChange,
}: LocalPathsFieldProps) {
  const { t } = useTranslation();
  const [white] = Uniwind.getCSSVariable(["--color-white"]) as string[];
  const [draft, setDraft] = useState("");

  const addPath = () => {
    const path = draft.trim();
    if (!path) return;
    if (!value.includes(path)) onChange([...value, path]);
    setDraft("");
  };

  return (
    <VStack className="gap-2 mb-2 mt-2">
      <Text className="text-primary-100 text-sm">
        {t("auth.login.localFoldersHelp")}
      </Text>
      <HStack className="gap-2 items-center">
        <Input className="flex-1 border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-4 py-2">
          <InputField
            value={draft}
            onChangeText={setDraft}
            className="text-md text-white"
            placeholder={t("auth.login.localPathPlaceholder")}
            placeholderTextColor={white}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={addPath}
          />
        </Input>
        <FadeOutScaleDown
          onPress={addPath}
          className="items-center justify-center px-4 py-3 rounded-md border border-emerald-500 bg-emerald-500"
        >
          <Text className="text-primary-800 font-bold">
            {t("auth.login.localAddPath")}
          </Text>
        </FadeOutScaleDown>
      </HStack>
      {value.map((path) => (
        <HStack
          key={path}
          className="items-center justify-between bg-primary-600 rounded-md px-4 py-3"
        >
          <HStack className="items-center gap-2 flex-1 mr-2">
            <FolderIcon size={18} color={white} />
            <Text className="text-white text-sm flex-1" numberOfLines={1}>
              {path}
            </Text>
          </HStack>
          <FadeOutScaleDown
            onPress={() => onChange(value.filter((p) => p !== path))}
          >
            <XIcon size={18} color={white} />
          </FadeOutScaleDown>
        </HStack>
      ))}
    </VStack>
  );
}
