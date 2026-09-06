import {
  compactParams,
  signatureBaseString,
} from "@/services/lastFm/signature";

describe("Last.fm api_sig", () => {
  describe("signatureBaseString", () => {
    it("matches the worked example in the Last.fm docs", () => {
      // md5("api_keyxxxxxxxxmethodauth.getSessiontokenxxxxxxxmysecret")
      // https://www.last.fm/api/webauth
      expect(
        signatureBaseString(
          {
            api_key: "xxxxxxxx",
            method: "auth.getSession",
            token: "xxxxxxx",
          },
          "mysecret",
        ),
      ).toBe("api_keyxxxxxxxxmethodauth.getSessiontokenxxxxxxxmysecret");
    });

    it("orders parameters by name, not by insertion", () => {
      expect(
        signatureBaseString(
          { track: "T", artist: "A", api_key: "K", method: "track.love" },
          "s",
        ),
      ).toBe("api_keyKartistAmethodtrack.lovetrackTs");
    });

    it("excludes format and callback but keeps everything else", () => {
      // Signing `format` is the single most common cause of error 13, and it is
      // still sent on the wire — the interceptor adds it after signing.
      expect(
        signatureBaseString(
          { method: "track.scrobble", format: "json", callback: "cb", sk: "K" },
          "s",
        ),
      ).toBe("methodtrack.scrobbleskKs");
    });

    it("sorts bracketed batch parameters by the ASCII table, not numerically", () => {
      // Last.fm requires ASCII ordering of the *full* parameter name including
      // the brackets, which is not the order a human would write: "]" is 0x5D
      // and "0" is 0x30, so `artist[10]` sorts before `artist[1]`, and both
      // before `artist[2]`. Sorting by the index instead yields error 13 on
      // every batch of ten or more scrobbles.
      const params: Record<string, string> = {};
      for (const i of [0, 1, 2, 10, 11]) params[`artist[${i}]`] = String(i);

      expect(signatureBaseString(params, "s")).toBe(
        "artist[0]0artist[10]10artist[11]11artist[1]1artist[2]2s",
      );
    });

    it("does not collate non-ASCII names the way a locale-aware sort would", () => {
      // `localeCompare` puts "ä" next to "a"; Last.fm compares code units, so it
      // sorts after "z". Getting this wrong only shows up on some libraries.
      const base = signatureBaseString({ a: "1", z: "2", ä: "3" }, "s");
      expect(base).toBe("a1z2ä3s");
    });

    it("keeps values verbatim, including non-ASCII and spaces", () => {
      expect(
        signatureBaseString(
          { artist: "Sigur Rós", track: "Hoppípolla" },
          "secret",
        ),
      ).toBe("artistSigur RóstrackHoppípollasecret");
    });
  });

  describe("compactParams", () => {
    it("drops undefined values and stringifies the rest", () => {
      expect(
        compactParams({
          artist: "A",
          duration: 217,
          album: undefined,
          chosenByUser: 0,
        }),
      ).toEqual({ artist: "A", duration: "217", chosenByUser: "0" });
    });

    it("keeps an empty string, which is a value Last.fm accepts", () => {
      expect(compactParams({ album: "" })).toEqual({ album: "" });
    });
  });
});
