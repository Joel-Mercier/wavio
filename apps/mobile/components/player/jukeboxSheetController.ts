import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import type { RefObject } from "react";

// The jukebox sheet lives once at the app root (see JukeboxSheet, mounted in
// app/(app)/_layout). This tiny controller lets any screen — the player chrome
// or the floating player — open it without prop-drilling a ref.
let sheetRef: RefObject<BottomSheetModal | null> | null = null;

export function setJukeboxSheetRef(
  ref: RefObject<BottomSheetModal | null> | null,
) {
  sheetRef = ref;
}

export function openJukeboxSheet() {
  sheetRef?.current?.present();
}

export function closeJukeboxSheet() {
  sheetRef?.current?.dismiss();
}
