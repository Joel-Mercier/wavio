import Plus from "lucide-react-native/dist/esm/icons/plus.mjs";
import X from "lucide-react-native/dist/esm/icons/x.mjs";
import { useTranslation } from "react-i18next";
import { Uniwind } from "uniwind";
import FadeOutScaleDown from "@/components/FadeOutScaleDown";
import { Box } from "@/components/ui/box";
import { HStack } from "@/components/ui/hstack";
import { ChevronDownIcon } from "@/components/ui/icon";
import {
  Select,
  SelectBackdrop,
  SelectContent,
  SelectDragIndicator,
  SelectDragIndicatorWrapper,
  SelectIcon,
  SelectInput,
  SelectItem,
  SelectPortal,
  SelectScrollView,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { VStack } from "@/components/ui/vstack";
import { supportsMultiFieldSort } from "@/utils/navidromeVersion";
import {
  type FormSortEntry,
  SORTABLE_FIELDS,
  type SortableField,
} from "@/utils/smartPlaylist";

interface SortEditorProps {
  sorts: FormSortEntry[];
  onChange: (sorts: FormSortEntry[]) => void;
  serverVersion: string | null;
}

export default function SortEditor({
  sorts,
  onChange,
  serverVersion,
}: SortEditorProps) {
  const { t } = useTranslation();
  const [red400] = Uniwind.getCSSVariable(["--color-red-400"]) as string[];
  const allowMulti = supportsMultiFieldSort(serverVersion);

  const updateEntry = (i: number, patch: Partial<FormSortEntry>) => {
    onChange(sorts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const removeEntry = (i: number) => {
    onChange(sorts.filter((_, idx) => idx !== i));
  };
  const addEntry = () => {
    onChange([...sorts, { field: "title", direction: "asc" }]);
  };

  const canAdd = allowMulti || sorts.length === 0;

  return (
    <VStack className="gap-y-3">
      <Text className="text-primary-100 text-xs uppercase">
        {t("app.smartPlaylist.sortBy")}
      </Text>
      {sorts.map((entry, i) => (
        <HStack
          // biome-ignore lint/suspicious/noArrayIndexKey: stable per index
          key={i}
          className="items-center gap-x-3"
        >
          <Box className="flex-1">
            <Select
              selectedValue={entry.field}
              onValueChange={(v) =>
                updateEntry(i, { field: v as SortableField })
              }
            >
              <SelectTrigger className="bg-primary-600 border-0 rounded-md px-4 py-2">
                <SelectInput
                  value={t(`app.smartPlaylist.sortFields.${entry.field}`)}
                  className="text-md text-white"
                />
                <SelectIcon as={ChevronDownIcon} />
              </SelectTrigger>
              <SelectPortal>
                <SelectBackdrop />
                <SelectContent className="bg-primary-700">
                  <SelectDragIndicatorWrapper>
                    <SelectDragIndicator />
                  </SelectDragIndicatorWrapper>
                  <SelectScrollView>
                    <Box className="p-6 w-full mb-12">
                      {SORTABLE_FIELDS.map((f) => (
                        <SelectItem
                          key={f}
                          value={f}
                          label={t(`app.smartPlaylist.sortFields.${f}`)}
                        />
                      ))}
                    </Box>
                  </SelectScrollView>
                </SelectContent>
              </SelectPortal>
            </Select>
          </Box>
          <Box className="w-40">
            <Select
              selectedValue={entry.direction}
              onValueChange={(v) =>
                updateEntry(i, { direction: v as "asc" | "desc" })
              }
            >
              <SelectTrigger className="bg-primary-600 border-0 rounded-md px-4 py-2">
                <SelectInput
                  value={t(`app.smartPlaylist.direction.${entry.direction}`)}
                  className="text-md text-white"
                />
                <SelectIcon as={ChevronDownIcon} />
              </SelectTrigger>
              <SelectPortal>
                <SelectBackdrop />
                <SelectContent className="bg-primary-700">
                  <SelectDragIndicatorWrapper>
                    <SelectDragIndicator />
                  </SelectDragIndicatorWrapper>
                  <SelectScrollView>
                    <Box className="p-6 w-full mb-12">
                      <SelectItem
                        value="asc"
                        label={t("app.smartPlaylist.direction.asc")}
                      />
                      <SelectItem
                        value="desc"
                        label={t("app.smartPlaylist.direction.desc")}
                      />
                    </Box>
                  </SelectScrollView>
                </SelectContent>
              </SelectPortal>
            </Select>
          </Box>
          <FadeOutScaleDown onPress={() => removeEntry(i)}>
            <X size={18} color={red400} />
          </FadeOutScaleDown>
        </HStack>
      ))}
      {canAdd && (
        <FadeOutScaleDown onPress={addEntry}>
          <HStack className="items-center gap-x-2 py-2">
            <Plus size={18} color="#10b981" />
            <Text className="text-emerald-500 font-bold">
              {t("app.smartPlaylist.addSort")}
            </Text>
          </HStack>
        </FadeOutScaleDown>
      )}
    </VStack>
  );
}
