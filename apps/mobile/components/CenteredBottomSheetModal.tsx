import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useRef } from "react";
import {
  BackHandler,
  type NativeEventSubscription,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface CenteredBottomSheetModalProps extends BottomSheetModalProps {
  // Spotify-style two-stage expansion: the sheet opens at ~half height (within
  // one-handed reach) and drags up to full. On by default; pass `false` for
  // short sheets whose content never fills half the screen (they'd otherwise
  // gain a half-height detent above their content and drag up into empty space).
  enableHalfExpand?: boolean;
}

// The collapsed detent for `enableHalfExpand`. gorhom (v5) merges this with the
// dynamic content-height detent and sorts them, so tall sheets get [50%, full]
// (open at 50%) while sheets shorter than 50% keep their content-height detent.
// Module-scoped so the array identity stays stable across renders.
const HALF_EXPAND_SNAP_POINTS = ["50%"];

// Wraps gorhom's BottomSheetModal to constrain it to the portrait width and
// center it. In portrait this is a no-op (maxWidth === screen width); in
// landscape (and on large screens) it stops sheets stretching edge-to-edge.
const CenteredBottomSheetModal = forwardRef<
  BottomSheetModal,
  CenteredBottomSheetModalProps
>(
  (
    {
      style,
      onChange,
      enableHalfExpand = true,
      snapPoints,
      enableDynamicSizing = true,
      maxDynamicContentSize,
      topInset,
      ...props
    },
    ref,
  ) => {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const maxWidth = Math.min(width, height);
    // `width:100%`+`maxWidth` constrains the sheet (and is needed for its
    // content to measure/render). gorhom pins it with left:0/right:0 *after* our
    // style, so it sits flush-left; symmetric horizontal margins then shift it
    // to center. Both are 0/no-op in portrait.
    const margin = Math.max(0, (width - maxWidth) / 2);

    // Two-stage expansion only applies to dynamically-sized sheets that don't
    // define their own snap points; sheets with explicit `snapPoints` or fixed
    // sizing (selects, tag pickers) keep their own layout.
    const halfExpand =
      enableHalfExpand && enableDynamicSizing && snapPoints === undefined;
    // With half-expand the full detent stops at `topInset` (below the status
    // bar, leaving a grab zone for the OS notification tray), so no extra cap is
    // needed. Otherwise cap dynamic content at ~80% so a tall sheet's handle
    // never reaches the top edge with nothing left to drag down.
    const resolvedSnapPoints = halfExpand
      ? HALF_EXPAND_SNAP_POINTS
      : snapPoints;
    const resolvedTopInset = halfExpand ? insets.top : topInset;
    const resolvedMaxDynamicContentSize = halfExpand
      ? maxDynamicContentSize
      : (maxDynamicContentSize ?? height * 0.8);

    // Dismiss the sheet on the Android hardware back button while it's open, so
    // every sheet built on this wrapper is back-dismissible without each call
    // site wiring its own handler. Composes with any consumer `onChange`.
    const modalRef = useRef<BottomSheetModal | null>(null);
    const backHandlerSubscriptionRef = useRef<NativeEventSubscription | null>(
      null,
    );
    const handleChange = useCallback<
      NonNullable<BottomSheetModalProps["onChange"]>
    >(
      (index, position, type) => {
        const isVisible = index >= 0;
        if (isVisible && !backHandlerSubscriptionRef.current) {
          backHandlerSubscriptionRef.current = BackHandler.addEventListener(
            "hardwareBackPress",
            () => {
              modalRef.current?.dismiss();
              return true;
            },
          );
        } else if (!isVisible) {
          backHandlerSubscriptionRef.current?.remove();
          backHandlerSubscriptionRef.current = null;
        }
        onChange?.(index, position, type);
      },
      [onChange],
    );

    const setRefs = useCallback(
      (instance: BottomSheetModal | null) => {
        modalRef.current = instance;
        if (typeof ref === "function") {
          ref(instance);
        } else if (ref) {
          ref.current = instance;
        }
      },
      [ref],
    );

    return (
      <BottomSheetModal
        ref={setRefs}
        onChange={handleChange}
        snapPoints={resolvedSnapPoints}
        enableDynamicSizing={enableDynamicSizing}
        maxDynamicContentSize={resolvedMaxDynamicContentSize}
        topInset={resolvedTopInset}
        style={[
          { width: "100%", maxWidth, marginLeft: margin, marginRight: margin },
          style,
        ]}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            {...props}
          />
        )}
        {...props}
      />
    );
  },
);

CenteredBottomSheetModal.displayName = "CenteredBottomSheetModal";

export default CenteredBottomSheetModal;
