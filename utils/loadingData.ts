export const loadingData = (length = 10) => {
  return Array.from({ length }, (_, i) => ({ id: i + 1 }));
};
