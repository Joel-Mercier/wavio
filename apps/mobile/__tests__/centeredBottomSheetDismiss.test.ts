// gorhom reads a dismiss() of a sheet that isn't presented as a dismissal in
// progress and ignores every present() after it, so a header button that
// shares a sheet action's handler (download, which dismisses first) left the
// album's menu unopenable until the screen remounted.

const mockSheet = {
  present: jest.fn(),
  dismiss: jest.fn(),
  onDismiss: undefined as (() => void) | undefined,
};

jest.mock("@gorhom/bottom-sheet", () => {
  const React = jest.requireActual("react");
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetModal: React.forwardRef(
      (props: { onDismiss?: () => void }, ref: unknown) => {
        mockSheet.onDismiss = props.onDismiss;
        React.useImperativeHandle(ref, () => ({
          present: mockSheet.present,
          dismiss: mockSheet.dismiss,
        }));
        return null;
      },
    ),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import * as React from "react";
import TestRenderer, { act } from "react-test-renderer";
import CenteredBottomSheetModal from "@/components/CenteredBottomSheetModal";

function mountSheet() {
  const ref = React.createRef<BottomSheetModal>();
  act(() => {
    TestRenderer.create(
      React.createElement(
        CenteredBottomSheetModal,
        { ref } as React.ComponentProps<typeof CenteredBottomSheetModal>,
        React.createElement(React.Fragment),
      ),
    );
  });
  if (!ref.current) throw new Error("no sheet ref");
  return ref.current;
}

beforeEach(() => jest.clearAllMocks());

it("drops a dismiss of a sheet that was never presented", () => {
  const sheet = mountSheet();
  sheet.dismiss();
  expect(mockSheet.dismiss).not.toHaveBeenCalled();
  sheet.present();
  expect(mockSheet.present).toHaveBeenCalledTimes(1);
});

it("dismisses a presented sheet", () => {
  const sheet = mountSheet();
  sheet.present();
  sheet.dismiss();
  expect(mockSheet.dismiss).toHaveBeenCalledTimes(1);
});

it("drops a dismiss once the sheet has closed on its own", () => {
  const sheet = mountSheet();
  sheet.present();
  act(() => mockSheet.onDismiss?.());
  sheet.dismiss();
  expect(mockSheet.dismiss).not.toHaveBeenCalled();
});
