import type { AnyFieldApi } from "@tanstack/react-form";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FieldError, {
  handleFieldBlur,
  showFieldError,
} from "@/components/forms/FieldError";
import { FormControl } from "@/components/ui/form-control";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";

/**
 * The single-sign-on switch, under "Advanced settings", with its manual
 * overrides. The issuer and client id are only needed when the server's proxy
 * doesn't publish where its sign-in lives (RFC 9728), or when the IdP minted
 * its own client id for Wavio.
 */
export default function SingleSignOnField({
  enabled,
  onToggle,
  issuerField,
  clientIdField,
  help,
}: {
  // The server forms save the setting without signing in, so they say when
  // it applies instead of the login screen's "turned on automatically".
  help?: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  issuerField: AnyFieldApi;
  clientIdField: AnyFieldApi;
}) {
  const { t } = useTranslation();
  const [white, gray500, emerald500] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-gray-500",
    "--color-emerald-500",
  ]) as string[];
  return (
    <FormControl
      isInvalid={enabled && showFieldError(issuerField)}
      size="md"
      className="my-2"
    >
      <HStack className="items-center justify-between">
        <VStack className="flex-1 pr-4">
          <Text className="text-white font-bold">
            {t("auth.login.oidcToggle")}
          </Text>
          <Text className="text-primary-100 text-xs mt-1">
            {help ?? t("auth.login.oidcToggleHelp")}
          </Text>
        </VStack>
        <Switch
          size="md"
          trackColor={{ false: gray500, true: emerald500 }}
          thumbColor={white}
          ios_backgroundColor={white}
          value={enabled}
          onToggle={onToggle}
        />
      </HStack>
      {enabled ? (
        <>
          <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 data-[invalid=true]:border-red-500 rounded-md px-6 py-2 mt-3">
            <InputField
              disableFullscreenUI
              value={issuerField.state.value ?? ""}
              onChangeText={issuerField.handleChange}
              onBlur={() => handleFieldBlur(issuerField)}
              className="text-md text-white"
              placeholder={t("auth.login.oidcIssuerPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </Input>
          <FieldError field={issuerField} />
          <Input className="border border-primary-600 bg-primary-600 data-[focus=true]:border-emerald-500 rounded-md px-6 py-2 mt-2">
            <InputField
              disableFullscreenUI
              value={clientIdField.state.value ?? ""}
              onChangeText={clientIdField.handleChange}
              className="text-md text-white"
              placeholder={t("auth.login.oidcClientIdPlaceholder")}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Input>
          <Text className="text-primary-100 text-xs mt-1">
            {t("auth.login.oidcSettingsHelp")}
          </Text>
        </>
      ) : null}
    </FormControl>
  );
}
