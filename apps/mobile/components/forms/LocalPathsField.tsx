import { StorageAccessFramework } from "expo-file-system/legacy";
import FolderIcon from "lucide-react-native/dist/esm/icons/folder.mjs";
import FolderPlusIcon from "lucide-react-native/dist/esm/icons/folder-plus.mjs";
import XIcon from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { logError } from "@/utils/log";

interface LocalPathsFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
}

// Turn an Android Storage Access Framework tree URI into a readable folder name.
// e.g. content://com.android.externalstorage.documents/tree/primary%3AMusic%2FRock
// -> "Music/Rock". Non-SAF entries (legacy plain paths) just drop the scheme.
function folderLabel(uri: string): string {
  if (!uri.startsWith("content://")) return uri.replace(/^file:\/\//, "");
  try {
    const treeIdx = uri.indexOf("/tree/");
    const decoded = decodeURIComponent(
      treeIdx >= 0 ? uri.slice(treeIdx + "/tree/".length) : uri,
    );
    const colon = decoded.lastIndexOf(":");
    return (colon >= 0 ? decoded.slice(colon + 1) : decoded) || decoded;
  } catch {
    return uri;
  }
}

// Editor for the local server's source folders. Tapping the field opens the
// Android directory picker (Storage Access Framework); the chosen folder's tree
// URI is added to the list. SAF grants one folder per call, so tap again to add
// more. Folders are persisted on the server entry (stores/servers.ts
// `Server.paths`) and walked by services/local/indexer.ts.
export default function LocalPathsField({
  value,
  onChange,
}: LocalPathsFieldProps) {
  const { t } = useTranslation();
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];

  const pickFolder = async () => {
    try {
      const result =
        await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!result.granted) return;
      const uri = result.directoryUri;
      if (!value.includes(uri)) onChange([...value, uri]);
    } catch (error) {
      logError("[LocalPathsField] Failed to pick folder", error);
    }
  };

  return (
    <VStack className="gap-2 mb-2 mt-2">
      <Text className="text-primary-100 text-sm">
        {t("auth.login.localFoldersHelp")}
      </Text>
      <FadeOutScaleDown
        onPress={pickFolder}
        className="flex-row items-center gap-2 border border-dashed border-emerald-500 bg-primary-600 rounded-md px-4 py-3"
      >
        <FolderPlusIcon size={18} color={emerald} />
        <Text className="text-emerald-500 font-bold">
          {t("auth.login.localPickFolder")}
        </Text>
      </FadeOutScaleDown>
      {value.map((path) => (
        <HStack
          key={path}
          className="items-center justify-between bg-primary-600 rounded-md px-4 py-3"
        >
          <HStack className="items-center gap-2 flex-1 mr-2">
            <FolderIcon size={18} color={white} />
            <Text className="text-white text-sm flex-1" numberOfLines={1}>
              {folderLabel(path)}
            </Text>
          </HStack>
          <FadeOutScaleDown
            onPress={() => onChange(value.filter((p) => p !== path))}
          >
            <XIcon size={18} color={white} />
          </FadeOutScaleDown>
        </HStack>
      ))}
    </VStack>
  );
}
