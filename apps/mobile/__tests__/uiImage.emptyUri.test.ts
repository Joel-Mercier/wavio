jest.mock("uniwind", () => ({
  withUniwind: <T>(component: T) => component,
}));
jest.mock("@gluestack-ui/utils/nativewind-utils", () => ({
  tva: () => () => "",
}));
jest.mock("@/services/serverHeaders", () => ({
  withServerHeaders: <T>(source: T) => source,
}));

import { Image as ExpoImage } from "expo-image";
import * as React from "react";
import TestRenderer from "react-test-renderer";
import { Image } from "@/components/ui/image";

const render = (props: React.ComponentProps<typeof Image>) => {
  let root!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(Image, props));
  });
  return root;
};

// Index-backed and Jellyfin backends resolve a missing cover to `""` (issue
// #208): the artist screen crashed on every artist without artwork.
describe("ui Image", () => {
  test("renders an empty-uri source without re-wrapping it", () => {
    const root = render({ source: { uri: "" }, alt: "cover" });
    expect(root.root.findByType(ExpoImage).props.source).toEqual({ uri: "" });
  });

  test("renders nothing without a source", () => {
    const root = render({ source: undefined, alt: "cover" });
    expect(root.toJSON()).toBeNull();
  });

  test("forwards alt as the accessibility label", () => {
    const root = render({ source: { uri: "file:///a.jpg" }, alt: "cover" });
    expect(root.root.findByType(ExpoImage).props.alt).toBe("cover");
  });
});
