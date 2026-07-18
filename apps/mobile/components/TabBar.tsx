import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import { cn } from "@/utils/tailwind";

export interface TabBarItem {
  key: string;
  title: string;
}

interface Props {
  tabs: TabBarItem[];
  activeIndex: number;
  onTabPress: (index: number) => void;
  height?: number;
  className?: string;
}

export default function TabBar({
  tabs,
  activeIndex,
  onTabPress,
  height = 48,
  className,
}: Props) {
  return (
    <View
      style={{ height }}
      className={cn("flex-row bg-black gap-x-8 px-6", className)}
    >
      {tabs.map((tab, i) => (
        <Pressable
          key={tab.key}
          onPress={() => onTabPress(i)}
          className="items-center justify-center"
        >
          <Text
            className={cn(
              "text-white text-md",
              activeIndex === i ? "font-bold" : "text-primary-100",
            )}
          >
            {tab.title}
          </Text>
          <View
            className={cn(
              "h-0.5 w-full mt-1 rounded-full",
              activeIndex === i ? "bg-emerald-500" : "bg-transparent",
            )}
          />
        </Pressable>
      ))}
    </View>
  );
}
