import ChevronsUpDown from "lucide-react-native/dist/esm/icons/chevrons-up-down.mjs";
import { InputField, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

export const WEB_PROTOCOLS = ["https://", "http://"];

/** For an SMB share's address — `smb://host[:port]/Share`. */
export const SMB_PROTOCOLS = ["smb://"];

/** The schemes a server type's URL field offers. */
export const protocolsForServerType = (type: string): string[] =>
  type === "smb" ? SMB_PROTOCOLS : WEB_PROTOCOLS;

/**
 * Re-schemes a URL when the server type changes, keeping whatever host was typed.
 * A field left at `https://nas.local` after picking SMB would otherwise fail
 * validation with nothing on screen explaining why, since the input renders the
 * scheme separately from the value it stores.
 */
export function realignUrlProtocol(url: string, protocols: string[]): string {
  if (protocols.some((protocol) => url.startsWith(protocol))) return url;
  return `${protocols[0]}${url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")}`;
}

interface UrlInputFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  className?: string;
  autoFocus?: boolean;
  /**
   * Schemes the field cycles through, first one being the default. A single
   * entry renders as a fixed label instead of a toggle — an SMB share has no
   * other scheme to offer.
   */
  protocols?: string[];
  // biome-ignore lint/suspicious/noExplicitAny: forwarded ref typing
  fieldRef?: any;
}

export default function UrlInputField({
  value,
  onChangeText,
  onBlur,
  placeholder,
  placeholderTextColor,
  className,
  autoFocus,
  protocols = WEB_PROTOCOLS,
  fieldRef,
}: UrlInputFieldProps) {
  const protocol =
    protocols.find((candidate) => value.startsWith(candidate)) ?? protocols[0];
  // Strips *any* leading scheme, not just the offered ones: the value carries a
  // scheme from whatever the field was last used for, so switching a server's
  // type (https → smb) or pasting a full URL must not stack two of them up.
  const stripProtocol = (text: string): string =>
    text.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = stripProtocol(value);
  const toggleProtocol = () => {
    const next =
      protocols[(protocols.indexOf(protocol) + 1) % protocols.length];
    onChangeText(`${next}${host}`);
  };
  const handleHostChange = (text: string) => {
    onChangeText(`${protocol}${stripProtocol(text)}`);
  };
  return (
    <>
      <InputSlot>
        {protocols.length > 1 ? (
          <Pressable
            onPress={toggleProtocol}
            className="pr-2 flex-row items-center gap-0.5"
          >
            <Text className="text-white text-md">{protocol}</Text>
            <ChevronsUpDown size={13} color="white" style={{ opacity: 0.8 }} />
          </Pressable>
        ) : (
          <Text className="text-white text-md pr-2">{protocol}</Text>
        )}
      </InputSlot>
      {/* No keyboardType="url": its Android textUri inputType hides the text caret on some keyboards */}
      <InputField
        disableFullscreenUI
        ref={fieldRef}
        value={host}
        onChangeText={handleHostChange}
        onBlur={onBlur}
        className={className ?? "text-md text-white"}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        autoFocus={autoFocus}
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </>
  );
}
