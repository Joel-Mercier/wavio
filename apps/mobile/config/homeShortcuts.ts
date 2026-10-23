// Home shortcuts render two per row, so the count is always even.
export const MIN_HOME_SHORTCUTS = 2;
export const MAX_HOME_SHORTCUTS = 20;
export const DEFAULT_HOME_SHORTCUTS = 8;

export const clampHomeShortcutsCount = (count: number) =>
  Math.min(
    MAX_HOME_SHORTCUTS,
    Math.max(MIN_HOME_SHORTCUTS, Math.round(count / 2) * 2),
  );
