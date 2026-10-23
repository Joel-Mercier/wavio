import { useCalendars } from "expo-localization";
import { formatClockTime } from "@/utils/date";

export function useFormatClockTime() {
  const uses24hourClock = useCalendars()[0]?.uses24hourClock;
  return (ms: number) => formatClockTime(ms, uses24hourClock);
}
