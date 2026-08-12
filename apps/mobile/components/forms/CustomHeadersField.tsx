import PlusIcon from "lucide-react-native/dist/esm/icons/plus.mjs";
import XIcon from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Input, InputField } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  type HeaderRow,
  MAX_CUSTOM_HEADERS,
  validateHeaderRows,
} from "@/stores/servers";

interface CustomHeadersFieldProps {
  value: HeaderRow[];
  onChange: (next: HeaderRow[]) => void;
}

// Editor for a server's user-defined HTTP headers, shown under "Advanced
// settings" in all three server forms. Exists for servers fronted by an
// authenticating reverse proxy — Cloudflare Access service tokens
// (CF-Access-Client-Id / CF-Access-Client-Secret), Authelia/Authentik, a static
// bearer token. The headers reach every request to that server: API, cover art,
// playback and downloads (services/serverHeaders.ts).
export default function CustomHeadersField({
  value,
  onChange,
}: CustomHeadersFieldProps) {
  const { t } = useTranslation();
  const [white, emerald, red] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
    "--color-red-500",
  ]) as string[];

  const issues = validateHeaderRows(value);
  const issueFor = (index: number, field: "key" | "value") =>
    issues.find((issue) => issue.index === index && issue.field === field);
  const tooMany = issues.some(
    (issue) => issue.message === "app.servers.headerTooMany",
  );

  const update = (index: number, patch: Partial<HeaderRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const inputClass = (invalid: boolean) =>
    `border rounded-md px-4 py-1 bg-primary-600 ${
      invalid ? "border-red-500" : "border-primary-600"
    }`;

  return (
    <VStack className="gap-2 mb-2 mt-2">
      <Text className="text-primary-100 text-xs">
        {t("app.servers.customHeadersHelp")}
      </Text>
      {value.map((row, index) => {
        const keyIssue = issueFor(index, "key");
        const valueIssue = issueFor(index, "value");
        return (
          <VStack
            // Index-keyed on purpose: a header's name is what the user is
            // editing, so keying on it would remount the input on every
            // keystroke and lose focus.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            key={index}
            className="gap-1"
          >
            <HStack className="items-center gap-2">
              <Input className={`flex-1 ${inputClass(!!keyIssue)}`}>
                <InputField
                  value={row.key}
                  onChangeText={(key) => update(index, { key })}
                  className="text-sm text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("app.servers.headerNamePlaceholder")}
                />
              </Input>
              <Input className={`flex-1 ${inputClass(!!valueIssue)}`}>
                <InputField
                  value={row.value}
                  onChangeText={(next) => update(index, { value: next })}
                  className="text-sm text-white"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={t("app.servers.headerValuePlaceholder")}
                />
              </Input>
              <FadeOutScaleDown
                onPress={() => onChange(value.filter((_, i) => i !== index))}
              >
                <XIcon size={18} color={white} />
              </FadeOutScaleDown>
            </HStack>
            {keyIssue || valueIssue ? (
              <Text className="text-red-500 text-xs">
                {t((keyIssue ?? valueIssue)?.message ?? "")}
              </Text>
            ) : null}
          </VStack>
        );
      })}
      {value.length < MAX_CUSTOM_HEADERS ? (
        <FadeOutScaleDown
          onPress={() => onChange([...value, { key: "", value: "" }])}
          className="flex-row items-center gap-2 border border-dashed border-emerald-500 bg-primary-600 rounded-md px-4 py-3"
        >
          <PlusIcon size={18} color={emerald} />
          <Text className="text-emerald-500 font-bold text-sm">
            {t("app.servers.addHeader")}
          </Text>
        </FadeOutScaleDown>
      ) : null}
      {tooMany ? (
        <HStack className="items-center gap-2">
          <XIcon size={14} color={red} />
          <Text className="text-red-500 text-xs">
            {t("app.servers.headerTooMany", { count: MAX_CUSTOM_HEADERS })}
          </Text>
        </HStack>
      ) : null}
      {value.length > 0 ? (
        <Text className="text-primary-100 text-xs">
          {t("app.servers.customHeadersStorageWarning")}
        </Text>
      ) : null}
    </VStack>
  );
}
