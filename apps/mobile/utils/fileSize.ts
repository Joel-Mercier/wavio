import i18n from "@/config/i18n";

export function niceBytes(x: number): string {
  let l = 0;
  let n = x || 0;

  while (n >= 1024 && ++l) {
    n = n / 1024;
  }

  return `${n.toFixed(n < 10 && l > 0 ? 1 : 0)} ${i18n.t(`app.shared.fileSizes.${l}`)}`;
}
