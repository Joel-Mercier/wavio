import { format as _format } from "date-fns/format";
import { formatDistanceToNow as _formatDistanceToNow } from "date-fns/formatDistanceToNow";
import type { Locale } from "date-fns/locale";
import { enUS as en } from "date-fns/locale/en-US";
import { fr } from "date-fns/locale/fr";
import { zhCN as cn } from "date-fns/locale/zh-CN";
import i18n from "@/config/i18n";

const locales: Record<string, Locale> = {
  en,
  fr,
  cn,
};

export const formatDistanceToNow = (date: Date) => {
  return _formatDistanceToNow(date, {
    locale: locales[i18n.language],
  });
};

export const format = (date: Date, formatString: string) => {
  return _format(date, formatString, {
    locale: locales[i18n.language],
  });
};

export const formatDuration = (seconds: number) => {
  const totalMinutes = Math.round(
    (Number.isFinite(seconds) ? seconds : 0) / 60,
  );
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(i18n.t("app.shared.duration.day", { count: days }));
  }
  if (days > 0 || hours > 0) {
    parts.push(i18n.t("app.shared.duration.hour", { count: hours }));
  }
  parts.push(i18n.t("app.shared.duration.minute", { count: minutes }));

  return parts.join(" ");
};

export const formatSeconds = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
};
