// Issue #286: a long playlist description pushed the play button below the
// fold. Collapsed, only the first paragraph shows, clamped, and the rest is one
// tap away.
const mockOpenBrowser = jest.fn();

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/components/ui/text", () => ({
  Text: jest.requireActual("react-native").Text,
}));
jest.mock("@/components/ui/vstack", () => ({
  VStack: jest.requireActual("react-native").View,
}));
jest.mock("@/components/ui/box", () => ({
  Box: jest.requireActual("react-native").View,
}));
jest.mock("@/components/ui/pressable", () => ({
  Pressable: jest.requireActual("react-native").Pressable,
}));
jest.mock("@/components/FadeOutScaleDown", () => {
  const { createElement } = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: function FadeOutScaleDown(props: object) {
      return createElement(Pressable, props);
    },
  };
});

import * as React from "react";
import { Linking, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import RichText from "@/components/RichText";

type Props = React.ComponentProps<typeof RichText>;

const DESCRIPTION =
  "where tf are we?\n\naround the world.m3u: 46/59 match\n\nhttps://github.com/Chic77/exportify-to-m3u";

function render(props: Props) {
  let root!: TestRenderer.ReactTestRenderer;
  act(() => {
    root = TestRenderer.create(React.createElement(RichText, props));
  });
  return root;
}

const flatten = (children: unknown): string =>
  typeof children === "string"
    ? children
    : Array.isArray(children)
      ? children.map(flatten).join("")
      : children && typeof children === "object" && "props" in children
        ? flatten((children as { props: { children: unknown } }).props.children)
        : "";

const visibleText = (root: TestRenderer.ReactTestRenderer) =>
  root.root
    .findAllByType(Text)
    .filter((node) => !node.props.onTextLayout && !node.props.onPress)
    .map((node) => flatten(node.props.children));

const texts = (
  root: TestRenderer.ReactTestRenderer,
  match: (props: Record<string, unknown>) => boolean,
) => root.root.findAll((n) => n.type === Text && match(n.props));

const clamped = (root: TestRenderer.ReactTestRenderer) =>
  texts(root, (p) => p.numberOfLines === 3);

const measurer = (root: TestRenderer.ReactTestRenderer) =>
  texts(root, (p) => typeof p.onTextLayout === "function");

const linkTo = (root: TestRenderer.ReactTestRenderer) =>
  texts(root, (p) => typeof p.onPress === "function")[0];

const toggle = (root: TestRenderer.ReactTestRenderer) =>
  root.root.findAllByType(FadeOutScaleDown);

const press = (node: TestRenderer.ReactTestInstance) =>
  act(() => {
    node.props.onPress();
  });

const layout = (root: TestRenderer.ReactTestRenderer, lines: number) => {
  act(() => {
    measurer(root)[0].props.onTextLayout({
      nativeEvent: { lines: Array.from({ length: lines }, () => ({})) },
    });
  });
};

const pressLink = async (root: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    await linkTo(root).props.onPress();
  });
};

describe("RichText collapsible", () => {
  beforeEach(() => jest.clearAllMocks());

  test("shows only the first paragraph, clamped, until expanded", () => {
    const root = render({ children: DESCRIPTION, collapsedLines: 3 });
    expect(clamped(root)).toHaveLength(1);
    expect(flatten(clamped(root)[0].props.children)).toBe("where tf are we?");
    expect(visibleText(root)).not.toContain(
      "around the world.m3u: 46/59 match",
    );

    press(toggle(root)[0]);

    const texts = visibleText(root);
    expect(texts).toContain("around the world.m3u: 46/59 match");
    expect(texts).toContain("https://github.com/Chic77/exportify-to-m3u");
    expect(texts).toContain("app.shared.seeLess");

    press(toggle(root)[0]);
    expect(clamped(root)).toHaveLength(1);
  });

  test("offers no toggle for one paragraph that fits", () => {
    const root = render({ children: "A short note", collapsedLines: 3 });
    layout(root, 2);
    expect(toggle(root)).toHaveLength(0);
    // gluestack's Pressable dims itself to 40% when disabled.
    expect(root.root.findAll((n) => n.props.disabled === true)).toHaveLength(0);
  });

  test("offers the toggle when one paragraph runs past the clamp", () => {
    const root = render({ children: "A long note", collapsedLines: 3 });
    layout(root, 5);
    expect(toggle(root)).toHaveLength(1);
  });

  test("never measures when more paragraphs already make it collapsible", () => {
    const root = render({ children: DESCRIPTION, collapsedLines: 3 });
    expect(measurer(root)).toHaveLength(0);
  });

  test("opens links in the system browser when asked to", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const root = render({
      children: "see https://example.com",
      collapsedLines: 3,
      openLinksExternally: true,
    });
    await pressLink(root);
    expect(openURL).toHaveBeenCalledWith("https://example.com");
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });

  test("opens links in the in-app browser by default", async () => {
    const root = render({ children: "see https://example.com" });
    await pressLink(root);
    expect(mockOpenBrowser).toHaveBeenCalledWith("https://example.com");
  });

  test("hands mailto links to the system even in-app", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const root = render({ children: "write to a@b.co" });
    await pressLink(root);
    expect(openURL).toHaveBeenCalledWith("mailto:a@b.co");
    expect(mockOpenBrowser).not.toHaveBeenCalled();
  });
});
