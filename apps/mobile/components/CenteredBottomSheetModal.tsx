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
import useApp from "@/stores/app";

// Wraps gorhom's BottomSheetModal to constrain it to the portrait width and
// center it. In portrait this is a no-op (maxWidth === screen width); in
// landscape (and on large screens) it stops sheets stretching edge-to-edge.
const CenteredBottomSheetModal = forwardRef<
  BottomSheetModal,
  BottomSheetModalProps
>(({ style, onChange, ...props }, ref) => {
  const { width, height } = useWindowDimensions();
  const maxWidth = Math.min(width, height);
  // In landscape a dynamically-sized sheet can grow tall enough that its drag
  // handle reaches the top edge and fights the OS notification-tray pull. Cap
  // the content height at ~80% of the screen there. Portrait is left untouched.
  const isWideLayout = useApp((s) => s.isWideLayout);
  // `width:100%`+`maxWidth` constrains the sheet (and is needed for its content
  // to measure/render). gorhom pins it with left:0/right:0 *after* our style, so
  // it sits flush-left; symmetric horizontal margins then shift it to center.
  // Both are 0/no-op in portrait.
  const margin = Math.max(0, (width - maxWidth) / 2);

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
      maxDynamicContentSize={isWideLayout ? height * 0.8 : undefined}
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
});

CenteredBottomSheetModal.displayName = "CenteredBottomSheetModal";

export default CenteredBottomSheetModal;
