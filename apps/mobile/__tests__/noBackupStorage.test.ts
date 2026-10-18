jest.mock("react-native-mmkv", () => ({
  createMMKV: jest.fn((config: { id: string }) => ({ id: config.id })),
}));
jest.mock("expo-file-system", () => ({
  Paths: {
    document: {
      parentDirectory: { uri: "file:///data/user/0/com.jmercier.wavio/" },
    },
  },
}));
jest.mock("@/services/backgroundTimer", () => ({}));

import { getNoBackupStorage } from "@/config/storage";

const { createMMKV } = jest.requireMock("react-native-mmkv");

describe("getNoBackupStorage", () => {
  it("roots the instance in Android's no_backup dir", () => {
    getNoBackupStorage("reviewPrompt");
    expect(createMMKV).toHaveBeenLastCalledWith({
      id: "reviewPrompt",
      path: "/data/user/0/com.jmercier.wavio/no_backup",
    });
  });

  it("reuses one instance per id", () => {
    expect(getNoBackupStorage("reviewPrompt")).toBe(
      getNoBackupStorage("reviewPrompt"),
    );
  });
});
