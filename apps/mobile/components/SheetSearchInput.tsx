import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useForm, useStore } from "@tanstack/react-form";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";

export default function SheetSearchInput({
  onChangeText,
  placeholder,
}: {
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const [primary50, white] = Uniwind.getCSSVariable([
    "--color-primary-50",
    "--color-white",
  ]) as string[];
  const form = useForm({ defaultValues: { query: "" } });
  const query = useStore(form.store, (state) => state.values.query);

  useEffect(() => {
    onChangeText(query);
  }, [query, onChangeText]);

  return (
    <Box className="flex-row items-center border border-primary-600 bg-primary-600 rounded-md px-4">
      <form.Field name="query">
        {(field) => (
          <BottomSheetTextInput
            className="flex-1"
            value={field.state.value}
            onChangeText={field.handleChange}
            placeholder={placeholder ?? t("app.shared.search")}
            placeholderTextColor={primary50}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ color: white, fontSize: 16, paddingVertical: 10 }}
          />
        )}
      </form.Field>
      {query.length > 0 && (
        <FadeOutScaleDown
          className="pl-2"
          onPress={() => form.setFieldValue("query", "")}
        >
          <X size={18} color={white} />
        </FadeOutScaleDown>
      )}
    </Box>
  );
}
