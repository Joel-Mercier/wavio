import type { AnyFieldApi } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import UrlInputField from "@/components/forms/UrlInputField";
import { FormControl } from "@/components/ui/form-control";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * Optional second address for the same server, shown under "Advanced settings"
 * in all three server forms. Shared so the field, its help text and its
 * validation stay identical across them.
 */
export default function FallbackUrlField({
  field,
  placeholder,
}: {
  field: AnyFieldApi;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <FormControl
      isInvalid={showFieldError(field)}
      size="md"
      isDisabled={false}
      isReadOnly={false}
      isRequired={false}
      className="my-2"
    >
      <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2">
        <UrlInputField
          value={field.state.value ?? ""}
          onChangeText={field.handleChange}
          onBlur={() => handleFieldBlur(field)}
          placeholder={placeholder}
        />
      </Input>
      {/* The "same server" contract is load-bearing (credentials and content are
          assumed identical across both routes) and this is the only place the
          user is told about it. */}
      <Text className="text-primary-100 text-xs mt-1">
        {t("app.shared.fallbackUrlHelp")}
      </Text>
      <FieldError field={field} />
    </FormControl>
  );
}
