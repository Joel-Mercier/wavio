// biome-ignore lint/suspicious/noExplicitAny: skeleton placeholder rows are not rendered as real items
export const loadingData = (length = 10): any[] => {
  return Array.from({ length }, (_, i) => ({ id: i + 1 }));
};
