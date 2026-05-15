import { format as _format } from "date-fns/format";
import { formatDistanceToNow as _formatDistanceToNow } from "date-fns/formatDistanceToNow";
import type { Locale } from "date-fns/locale";
import { enUS as en } from "date-fns/locale/en-US";
import { fr } from "date-fns/locale/fr";
import i18n from "@/config/i18n";

const locales: Record<string, Locale> = {
  en,
  fr,
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
