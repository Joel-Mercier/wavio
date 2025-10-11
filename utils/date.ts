import i18n from "@/config/i18n";
import {
  type Locale,
  format as _format,
  formatDistanceToNow as _formatDistanceToNow,
} from "date-fns";
import { enUS as en, fr } from "date-fns/locale";

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
