import type { AnyFieldApi } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import { FormControl } from "@/components/ui/form-control";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * The sub-path within a network file share to scan (`Server.libraryPath`).
 *
 * Shared by the login screen and both server dialogs because a share's scanned
 * root is editable from all three, and the hint — that leaving it empty walks
 * the entire share — is the part users need in each.
 */
export default function LibraryPathField({ field }: { field: AnyFieldApi }) {
  const { t } = useTranslation();
  return (
    <FormControl
      isInvalid={showFieldError(field)}
      size="md"
      isDisabled={false}
      isReadOnly={false}
      isRequired={false}
      className="mb-2 mt-0"
    >
      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
        <InputField
          value={field.state.value as string}
          onChangeText={field.handleChange}
          onBlur={() => handleFieldBlur(field)}
          placeholder={t("auth.login.libraryPathPlaceholder")}
          autoCapitalize="none"
          autoCorrect={false}
          className="text-white"
        />
      </Input>
      <Text className="text-primary-100 text-xs mt-1 mb-2">
        {t("auth.login.libraryPathHint")}
      </Text>
      <FieldError field={field} />
    </FormControl>
  );
}
