import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutChangeEvent, ScrollView } from "react-native";

// Leaves the rows above the target on screen, so the scroll reads as landing on
// a row within the section rather than as a different screen.
const SCROLL_MARGIN = 48;

/**
 * Lets a settings screen be deep-linked at one of its rows, via a `highlight`
 * search param naming that row. Wire `scrollRef` to the scaffold, `onLayout` to
 * a wrapper around the row, and `highlighted` to the row itself.
 */
export function useHighlightedSetting(key: string) {
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const [rowY, setRowY] = useState<number | null>(null);
  const highlighted = highlight === key;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setRowY(event.nativeEvent.layout.y);
  }, []);

  // Waits for the row to report its position: on mount the ScrollView has no
  // content laid out yet, so scrolling straight away would go nowhere.
  useEffect(() => {
    if (!highlighted || rowY === null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(rowY - SCROLL_MARGIN, 0),
      animated: true,
    });
  }, [highlighted, rowY]);

  return { scrollRef, highlighted, onLayout };
}
