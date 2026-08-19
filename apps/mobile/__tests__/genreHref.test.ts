// Genre route params are the genre *name*, not an opaque id, and servers hand
// back names containing slashes ("Chill Out/Trip-Hop/Lounge" — issue #165).
// Interpolating one into a path string splits it into extra segments, so
// `genres/[id]` stops matching and the screen never mounts. `genreHref` encodes
// the param instead; these tests pin that round trip, including the *second*
// decode expo-router applies (getStateFromPath decodes the matched segment, then
// useLocalSearchParams decodes route.params again).
import { resolveHref } from "expo-router/build/link/href";
import { genreHref } from "@/utils/navigation";

const SLASHED = "Chill Out/Trip-Hop/Lounge";
const PERCENT_ESCAPED = "Drum%20n%20Bass";

const path = (value: string) => resolveHref(genreHref(value));

// What the screen actually receives: expo-router decodes the dynamic segment
// once when matching the route, then once more when reading route.params.
const paramReceivedByScreen = (value: string) =>
  decodeURIComponent(decodeURIComponent(path(value).split("/")[2]));

describe("genre hrefs", () => {
  it("keeps a slashed genre name inside a single path segment", () => {
    expect(path(SLASHED).split("/")).toHaveLength(3);
  });

  it("survives both decodes for a slashed genre name", () => {
    expect(paramReceivedByScreen(SLASHED)).toBe(SLASHED);
  });

  it("survives both decodes for a name containing a percent escape", () => {
    expect(paramReceivedByScreen(PERCENT_ESCAPED)).toBe(PERCENT_ESCAPED);
  });

  it("leaves an ordinary genre name readable", () => {
    expect(path("Ambient")).toBe("/genres/Ambient");
    expect(paramReceivedByScreen("Ambient")).toBe("Ambient");
  });
});
