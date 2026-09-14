import { StorageAccessFramework } from "expo-file-system/legacy";
import FolderIcon from "lucide-react-native/dist/esm/icons/folder.mjs";
import FolderPlusIcon from "lucide-react-native/dist/esm/icons/folder-plus.mjs";
import SmartphoneIcon from "lucide-react-native/dist/esm/icons/smartphone.mjs";
import XIcon from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { HStack } from "@/components/ui/hstack";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import {
  addPickedFolder,
  musicRootLabelParams,
  usesLocalFolderRoots,
} from "@/services/fileSource/localFolders";
import { musicRoot } from "@/services/fileSource/localFolderUris";
import { folderLabel } from "@/services/local/paths";
import { logError } from "@/utils/log";

interface LocalPathsFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
}

// Editor for the local server's source folders. Folders are persisted on the
// server entry (stores/servers.ts `Server.paths`) and walked by
// services/local/indexer.ts.
//
// Android: tapping the field opens the Storage Access Framework directory
// picker; the chosen folder's tree URI is added to the list. SAF grants one
// folder per call, so tap again to add more.
//
// iOS: the app's own Music folder (visible in the Files app) is always the
// first root and can't be removed; further folders come from the Files picker
// through services/fileSource/localFolders.ts, which persists the grant.
export default function LocalPathsField({
  value,
  onChange,
}: LocalPathsFieldProps) {
  const { t } = useTranslation();
  const [white, emerald] = Uniwind.getCSSVariable([
    "--color-white",
    "--color-emerald-500",
  ]) as string[];
  const folderRoots = usesLocalFolderRoots();

  const pickFolder = async () => {
    try {
      const uri = folderRoots
        ? await addPickedFolder()
        : await pickAndroidFolder();
      if (uri && !value.includes(uri)) onChange([...value, uri]);
    } catch (error) {
      logError("[LocalPathsField] Failed to pick folder", error);
    }
  };

  const removable = folderRoots
    ? value.filter((path) => path !== musicRoot())
    : value;

  return (
    <VStack className="gap-2 mb-2 mt-2">
      <Text className="text-primary-100 text-sm">
        {t(
          folderRoots
            ? "auth.login.localMusicFolderHelp"
            : "auth.login.localFoldersHelp",
          musicRootLabelParams(),
        )}
      </Text>
      {folderRoots && (
        <HStack className="items-center gap-2 bg-primary-600 rounded-md px-4 py-3">
          <SmartphoneIcon size={18} color={white} />
          <Text className="text-white text-sm flex-1" numberOfLines={1}>
            {t("auth.login.localMusicFolder", musicRootLabelParams())}
          </Text>
        </HStack>
      )}
      <FadeOutScaleDown
        onPress={pickFolder}
        className="flex-row items-center gap-2 border border-dashed border-emerald-500 bg-primary-600 rounded-md px-4 py-3"
      >
        <FolderPlusIcon size={18} color={emerald} />
        <Text className="text-emerald-500 font-bold">
          {t(
            folderRoots
              ? "auth.login.localPickFolderFiles"
              : "auth.login.localPickFolder",
          )}
        </Text>
      </FadeOutScaleDown>
      {removable.map((path) => (
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

async function pickAndroidFolder(): Promise<string | null> {
  const result =
    await StorageAccessFramework.requestDirectoryPermissionsAsync();
  return result.granted ? result.directoryUri : null;
}
