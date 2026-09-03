// The one green every header tint in the app is built from.
export const HEADER_TINT = [29, 56, 42] as const;

export const headerTintAlpha = (alpha: number) =>
  `rgba(${HEADER_TINT.join(", ")}, ${alpha})`;

// The tint as a plain colour, for the artwork-derived headers to fall back on
// when colour extraction comes up empty.
export const HEADER_TINT_COLOR = `rgb(${HEADER_TINT.join(", ")})`;

// smoothstep: flat at both ends, so the ramp has no kink to catch the eye.
const smoothstep = (t: number) => t * t * (3 - 2 * t);

const STEPS = 8;

// A two-stop ramp reads as a hard edge in a short header: RGB-linear
// interpolation crowds most of the visible change into the top third, and the
// stop itself (`locations={[0, 0.7]}`) leaves a kink where the ramp turns into
// flat background. These stops fade the tint's alpha along a smoothstep instead
// — it holds under the title, falls away through the middle and reaches zero
// with no visible edge, over the full height rather than the first 70%. Enough
// steps to keep Android from banding across a short gradient.
export const HEADER_TINT_STOPS = {
  colors: Array.from({ length: STEPS + 1 }, (_, i) =>
    headerTintAlpha(Number((1 - smoothstep(i / STEPS)).toFixed(4))),
  ) as unknown as readonly [string, string, ...string[]],
  locations: Array.from({ length: STEPS + 1 }, (_, i) =>
    Number((i / STEPS).toFixed(4)),
  ) as unknown as readonly [number, number, ...number[]],
};
