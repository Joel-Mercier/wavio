import { router } from "expo-router";
import { useEffect } from "react";
import { startWidgetPlayback } from "@/services/player";

// Target of the `wavio://play` deep link fired by the widget play button on a
// cold start. Kicks off playback (resume last queue, else a random mix) and
// hands the user straight to the player. The `(app)` auth guard already
// redirects here to login when unauthenticated, so no extra check is needed.
export default function PlayDeepLink() {
  useEffect(() => {
    void startWidgetPlayback();
    router.replace("/player");
  }, []);

  return null;
}
