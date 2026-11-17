import { openBrowserAsync } from "expo-web-browser";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, StyleSheet } from "react-native";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  formatRichTextPlain,
  type Paragraph,
  parseRichText,
} from "@/utils/formatRichText";
import { cn } from "@/utils/tailwind";

interface RichTextProps {
  children?: string | null;
  className?: string;
  containerClassName?: string;
  numberOfLines?: number;
  collapsedLines?: number;
  openLinksExternally?: boolean;
}

async function openRichTextLink(href: string, external = false) {
  if (Platform.OS === "web") {
    window.open(href, "_blank");
    return;
  }
  if (external || !/^https?:\/\//i.test(href)) {
    await Linking.openURL(href).catch(() => {});
    return;
  }
  await openBrowserAsync(href);
}

function ParagraphText({
  paragraph,
  className,
  numberOfLines,
  openLinksExternally,
}: {
  paragraph: Paragraph;
  className?: string;
  numberOfLines?: number;
  openLinksExternally?: boolean;
}) {
  return (
    <Text className={className} numberOfLines={numberOfLines}>
      {paragraph.map((node, j) =>
        node.type === "link" ? (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed nodes have no identity and are rebuilt from the string as a whole
            key={j}
            className={cn(className, "underline text-emerald-500")}
            onPress={() => openRichTextLink(node.href, openLinksExternally)}
          >
            {node.value}
          </Text>
        ) : (
          node.value
        ),
      )}
    </Text>
  );
}

function CollapsibleParagraphs({
  paragraphs,
  className,
  containerClassName,
  collapsedLines,
  openLinksExternally,
}: {
  paragraphs: Paragraph[];
  className?: string;
  containerClassName?: string;
  collapsedLines: number;
  openLinksExternally?: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [firstOverflows, setFirstOverflows] = useState(false);
  const hasMore = paragraphs.length > 1;
  const collapsible = hasMore || firstOverflows;
  const toggleClassName = cn(className, "font-bold");

  if (expanded) {
    return (
      <VStack className={cn("gap-y-2", containerClassName)}>
        {paragraphs.map((para, i) => (
          <ParagraphText
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed paragraphs have no identity and are rebuilt from the string as a whole
            key={i}
            paragraph={para}
            className={className}
            openLinksExternally={openLinksExternally}
          />
        ))}
        <FadeOutScaleDown
          onPress={() => setExpanded(false)}
          className="self-start"
        >
          <Text className={toggleClassName}>{t("app.shared.seeLess")}</Text>
        </FadeOutScaleDown>
      </VStack>
    );
  }

  return (
    <VStack className={cn("gap-y-1", containerClassName)}>
      <Pressable
        accessible={false}
        onPress={collapsible ? () => setExpanded(true) : undefined}
      >
        {/* The visible copy is clamped, so its own layout can't tell whether
            it was cut: Android reports only the lines it drew. */}
        {!hasMore && (
          <Box
            style={StyleSheet.absoluteFill}
            className="opacity-0"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              className={className}
              onTextLayout={(e) =>
                setFirstOverflows(e.nativeEvent.lines.length > collapsedLines)
              }
            >
              {paragraphs[0].map((node) => node.value).join("")}
            </Text>
          </Box>
        )}
        <ParagraphText
          paragraph={paragraphs[0]}
          className={className}
          numberOfLines={collapsedLines}
          openLinksExternally={openLinksExternally}
        />
      </Pressable>
      {collapsible && (
        <FadeOutScaleDown
          onPress={() => setExpanded(true)}
          className="self-start"
        >
          <Text className={toggleClassName}>{t("app.shared.seeMore")}</Text>
        </FadeOutScaleDown>
      )}
    </VStack>
  );
}

export default function RichText({
  children,
  className,
  containerClassName,
  numberOfLines,
  collapsedLines,
  openLinksExternally,
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

  if (collapsedLines) {
    return (
      <CollapsibleParagraphs
        paragraphs={paragraphs}
        className={className}
        containerClassName={containerClassName}
        collapsedLines={collapsedLines}
        openLinksExternally={openLinksExternally}
      />
    );
  }

  return (
    <VStack className={cn("gap-y-2", containerClassName)}>
      {paragraphs.map((para, i) => (
        <ParagraphText
          // biome-ignore lint/suspicious/noArrayIndexKey: parsed paragraphs have no identity and are rebuilt from the string as a whole
          key={i}
          paragraph={para}
          className={className}
          openLinksExternally={openLinksExternally}
        />
      ))}
    </VStack>
  );
}
