import { useTranslation } from "react-i18next";
import {
  Checkbox,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
} from "@/components/ui/checkbox";
import { FormControl } from "@/components/ui/form-control";
import { CheckIcon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

/**
 * Force Subsonic legacy password auth (`p=enc:<hex>`) for this server instead of
 * token+salt, shown under "Advanced settings" in all three server forms. Shared
 * so the wording — including the warning that the password then travels in every
 * query string — stays identical across them.
 *
 * Off by default: token auth is preferred and a server that can't do it usually
 * says so (error 41/42), which the login flow already handles on its own. This is
 * for the servers that fail some other way.
 */
export default function PlainPasswordAuthField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormControl size="md" className="my-2">
      <Checkbox
        value="plain-password-auth"
        isChecked={value}
        onChange={onChange}
      >
        <CheckboxIndicator className="border-primary-100 data-[checked=true]:bg-emerald-500 data-[checked=true]:border-emerald-500">
          <CheckboxIcon as={CheckIcon} />
        </CheckboxIndicator>
        <CheckboxLabel className="text-primary-100">
          {t("app.shared.plainPasswordAuth")}
        </CheckboxLabel>
      </Checkbox>
      <Text className="text-primary-100 text-xs mt-1">
        {t("app.shared.plainPasswordAuthHelp")}
      </Text>
    </FormControl>
  );
}
