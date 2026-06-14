import { InputField, InputSlot } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";

interface UrlInputFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  className?: string;
  autoFocus?: boolean;
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
  fieldRef,
}: UrlInputFieldProps) {
  const protocol = value.startsWith("http://") ? "http://" : "https://";
  const host = value.replace(/^https?:\/\//, "");
  const toggleProtocol = () => {
    const next = protocol === "https://" ? "http://" : "https://";
    onChangeText(`${next}${host}`);
  };
  const handleHostChange = (text: string) => {
    onChangeText(`${protocol}${text.replace(/^https?:\/\//, "")}`);
  };
  return (
    <>
      <InputSlot>
        <Pressable onPress={toggleProtocol} className="pr-2 justify-center">
          <Text className="text-white text-md">{protocol}</Text>
        </Pressable>
      </InputSlot>
      {/* No keyboardType="url": its Android textUri inputType hides the text caret on some keyboards */}
      <InputField
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
