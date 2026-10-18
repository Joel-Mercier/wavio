// Issue #225: the Integrations entry was hidden on WebDAV and SMB by a rule that
// only knew about MusicBrainz and AudioMuse-AI, so the ListenBrainz and Last.fm
// screens were unreachable on exactly the libraries no server scrobbles for.

const mockAuth = { serverType: "navidrome" };

jest.mock("@/config/storage", () => ({
  storage: { set: () => {}, getString: () => null, remove: () => {} },
  zustandStorage: {
    setItem: () => {},
    getItem: () => null,
    removeItem: () => {},
  },
}));
jest.mock("uniwind", () => ({
  Uniwind: { getCSSVariable: () => ["#fff"] },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/stores/auth", () => ({
  useAuthBase: (selector: (state: typeof mockAuth) => unknown) =>
    selector(mockAuth),
}));
jest.mock("@/hooks/useCapabilities", () => ({
  useCapabilities: () =>
    jest
      .requireActual("@/services/backend/capabilities")
      .getCapabilities(mockAuth.serverType),
}));
jest.mock("lucide-react-native/dist/esm/icons/archive.mjs", () => () => null);
jest.mock(
  "lucide-react-native/dist/esm/icons/audio-lines.mjs",
  () => () => null,
);
jest.mock("lucide-react-native/dist/esm/icons/car.mjs", () => () => null);
jest.mock(
  "lucide-react-native/dist/esm/icons/cloud-download.mjs",
  () => () => null,
);
jest.mock("lucide-react-native/dist/esm/icons/download.mjs", () => () => null);
jest.mock(
  "lucide-react-native/dist/esm/icons/hard-drive.mjs",
  () => () => null,
);
jest.mock("lucide-react-native/dist/esm/icons/library.mjs", () => () => null);
jest.mock(
  "lucide-react-native/dist/esm/icons/mic-signal.mjs",
  () => () => null,
);
jest.mock("lucide-react-native/dist/esm/icons/palette.mjs", () => () => null);
jest.mock("lucide-react-native/dist/esm/icons/radio.mjs", () => () => null);
jest.mock(
  "lucide-react-native/dist/esm/icons/refresh-cw.mjs",
  () => () => null,
);
jest.mock(
  "lucide-react-native/dist/esm/icons/shield-check.mjs",
  () => () => null,
);
jest.mock("lucide-react-native/dist/esm/icons/workflow.mjs", () => () => null);
jest.mock("@/components/settings/SettingsLinkRow", () => () => null);
jest.mock(
  "@/components/settings/SettingsScreenScaffold",
  () =>
    ({ children }: { children: unknown }) =>
      children,
);
jest.mock("@/components/ui/vstack", () => ({
  VStack: ({ children }: { children: unknown }) => children,
}));

import * as React from "react";
import TestRenderer from "react-test-renderer";
import SettingsLinkRow from "@/components/settings/SettingsLinkRow";
import SettingsMenu from "@/components/settings/SettingsMenu";
import { serverTypeSchema } from "@/stores/servers";

const menuHrefs = () => {
  let root!: TestRenderer.ReactTestRenderer;
  TestRenderer.act(() => {
    root = TestRenderer.create(React.createElement(SettingsMenu));
  });
  return root.root
    .findAllByType(SettingsLinkRow)
    .map((row) => row.props.href as string);
};

describe("settings menu", () => {
  test.each(serverTypeSchema.options)("offers Integrations on %s", (type) => {
    mockAuth.serverType = type;
    expect(menuHrefs()).toContain("/settings/integrations");
  });
});
