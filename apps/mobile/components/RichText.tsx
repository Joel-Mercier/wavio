import { openBrowserAsync } from "expo-web-browser";
import { Platform } from "react-native";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { formatRichTextPlain, parseRichText } from "@/utils/formatRichText";
import { cn } from "@/utils/tailwind";

interface RichTextProps {
  children?: string | null;
  className?: string;
  numberOfLines?: number;
}

export default function RichText({
  children,
  className,
  numberOfLines,
}: RichTextProps) {
  if (numberOfLines) {
    const text = formatRichTextPlain(children);
    if (!text) return null;
    return (
      <Text className={className} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const paragraphs = parseRichText(children);
  if (paragraphs.length === 0) return null;

  const handleLinkPress = async (href: string) => {
    if (Platform.OS === "web") {
      window.open(href, "_blank");
      return;
    }
    await openBrowserAsync(href);
  };

  return (
    <VStack className="gap-y-2">
      {paragraphs.map((para, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parsed paragraphs have no identity and are rebuilt from the string as a whole
        <Text key={i} className={className}>
          {para.map((node, j) =>
            node.type === "link" ? (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: parsed nodes have no identity and are rebuilt from the string as a whole
                key={j}
                className={cn(className, "underline text-emerald-500")}
                onPress={() => handleLinkPress(node.href)}
              >
                {node.value}
              </Text>
            ) : (
              node.value
            ),
          )}
        </Text>
      ))}
    </VStack>
  );
}
