"use client";
import { createAlertDialog } from "@gluestack-ui/core/alert-dialog/creator";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";
import {
  tva,
  useStyleContext,
  withStyleContext,
} from "@gluestack-ui/utils/nativewind-utils";
import React from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCOPE = "ALERT_DIALOG";

// Breathing room kept between the dialog and the edges of the usable area.
const VERTICAL_MARGIN = 24;
// Floor so a tall keyboard on a short screen can't collapse the dialog entirely.
const MIN_CONTENT_HEIGHT = 160;

const RootComponent = withStyleContext(View, SCOPE);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

const UIAccessibleAlertDialog = createAlertDialog({
  Root: RootComponent,
  Body: ScrollView,
  Content: AnimatedView,
  CloseButton: Pressable,
  Header: View,
  Footer: View,
  Backdrop: AnimatedPressable,
});

const alertDialogStyle = tva({
  base: "group/modal w-full h-full justify-center items-center web:pointer-events-none",
  parentVariants: {
    size: {
      xs: "",
      sm: "",
      md: "",
      lg: "",
      full: "",
    },
  },
});

const alertDialogContentStyle = tva({
  base: "bg-background rounded-lg overflow-hidden border border-border p-6",
  parentVariants: {
    size: {
      xs: "w-[60%] max-w-[360px]",
      sm: "w-[70%] max-w-[420px]",
      md: "w-[80%] max-w-[510px]",
      lg: "w-[90%] max-w-[640px]",
      full: "w-full",
    },
  },
});

const alertDialogCloseButtonStyle = tva({
  base: "group/alert-dialog-close-button z-10 rounded-sm p-2 data-[focus-visible=true]:bg-background/10 web:cursor-pointer outline-0",
});

const alertDialogHeaderStyle = tva({
  base: "justify-between items-center flex-row shrink-0",
});

const alertDialogFooterStyle = tva({
  base: "flex-row justify-end items-center gap-3 shrink-0",
});

// `shrink` lets the body give way once the content is capped by the dialog's
// max height, so overflow scrolls inside it instead of pushing the header and
// footer off screen.
const alertDialogBodyStyle = tva({ base: "shrink" });

const alertDialogBackdropStyle = tva({
  base: "absolute left-0 top-0 right-0 bottom-0 bg-black/50 web:cursor-default",
});

type IAlertDialogProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog
> &
  VariantProps<typeof alertDialogStyle>;

type IAlertDialogContentProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.Content
> &
  VariantProps<typeof alertDialogContentStyle> & { className?: string };

type IAlertDialogCloseButtonProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.CloseButton
> &
  VariantProps<typeof alertDialogCloseButtonStyle>;

type IAlertDialogHeaderProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.Header
> &
  VariantProps<typeof alertDialogHeaderStyle>;

type IAlertDialogFooterProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.Footer
> &
  VariantProps<typeof alertDialogFooterStyle>;

type IAlertDialogBodyProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.Body
> &
  VariantProps<typeof alertDialogBodyStyle>;

type IAlertDialogBackdropProps = React.ComponentPropsWithoutRef<
  typeof UIAccessibleAlertDialog.Backdrop
> &
  VariantProps<typeof alertDialogBackdropStyle> & { className?: string };

const AlertDialog = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog>,
  IAlertDialogProps
>(function AlertDialog({ className, size = "md", ...props }, ref) {
  return (
    <UIAccessibleAlertDialog
      ref={ref}
      {...props}
      className={alertDialogStyle({ class: className })}
      context={{ size }}
      pointerEvents="box-none"
    />
  );
});

const AlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.Content>,
  IAlertDialogContentProps
>(function AlertDialogContent({ className, size, style, ...props }, ref) {
  const { size: parentSize } = useStyleContext(SCOPE);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);

  // The body scroll view sizes itself to its content, so without a cap a long
  // form grows the dialog past the screen and takes the header and footer with
  // it, out of reach. `marginBottom` re-centers what's left in the space above
  // the keyboard (the parent centers content box + margins), which is why no
  // dialog needs a KeyboardAvoidingView wrapper of its own.
  const maxHeight = Math.max(
    MIN_CONTENT_HEIGHT,
    windowHeight -
      insets.top -
      insets.bottom -
      keyboardHeight -
      VERTICAL_MARGIN * 2,
  );

  return (
    <UIAccessibleAlertDialog.Content
      pointerEvents="auto"
      entering={ZoomIn.duration(200).withInitialValues({ scale: 0.9 })}
      exiting={FadeOut.duration(200)}
      ref={ref}
      {...props}
      style={[{ maxHeight, marginBottom: keyboardHeight }, style]}
      className={alertDialogContentStyle({
        parentVariants: {
          size: parentSize,
        },
        size,
        class: className,
      })}
    />
  );
});

const AlertDialogCloseButton = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.CloseButton>,
  IAlertDialogCloseButtonProps
>(function AlertDialogCloseButton({ className, ...props }, ref) {
  return (
    <UIAccessibleAlertDialog.CloseButton
      ref={ref}
      {...props}
      className={alertDialogCloseButtonStyle({
        class: className,
      })}
    />
  );
});

const AlertDialogHeader = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.Header>,
  IAlertDialogHeaderProps
>(function AlertDialogHeader({ className, ...props }, ref) {
  return (
    <UIAccessibleAlertDialog.Header
      ref={ref}
      {...props}
      className={alertDialogHeaderStyle({
        class: className,
      })}
    />
  );
});

const AlertDialogFooter = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.Footer>,
  IAlertDialogFooterProps
>(function AlertDialogFooter({ className, ...props }, ref) {
  return (
    <UIAccessibleAlertDialog.Footer
      ref={ref}
      {...props}
      className={alertDialogFooterStyle({
        class: className,
      })}
    />
  );
});

const AlertDialogBody = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.Body>,
  IAlertDialogBodyProps
>(function AlertDialogBody({ className, ...props }, ref) {
  return (
    <UIAccessibleAlertDialog.Body
      ref={ref}
      {...props}
      className={alertDialogBodyStyle({
        class: className,
      })}
    />
  );
});

const AlertDialogBackdrop = React.forwardRef<
  React.ComponentRef<typeof UIAccessibleAlertDialog.Backdrop>,
  IAlertDialogBackdropProps
>(function AlertDialogBackdrop({ className, ...props }, ref) {
  return (
    <UIAccessibleAlertDialog.Backdrop
      ref={ref}
      {...props}
      entering={FadeIn.duration(200).easing(Easing.linear)}
      exiting={FadeOut.duration(200).easing(Easing.linear)}
      className={alertDialogBackdropStyle({
        class: className,
      })}
    />
  );
});

AlertDialog.displayName = "AlertDialog";
AlertDialogContent.displayName = "AlertDialogContent";
AlertDialogCloseButton.displayName = "AlertDialogCloseButton";
AlertDialogHeader.displayName = "AlertDialogHeader";
AlertDialogFooter.displayName = "AlertDialogFooter";
AlertDialogBody.displayName = "AlertDialogBody";
AlertDialogBackdrop.displayName = "AlertDialogBackdrop";

export {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogBody,
  AlertDialogCloseButton,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
};
