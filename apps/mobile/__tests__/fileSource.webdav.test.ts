// WebDAV had no error taxonomy: `list` threw a raw AxiosError and `exists`
// answered `false` for everything — a 401, a timeout and a genuinely missing
// folder alike. That last one is why this matters beyond message quality: the
// scanner prunes tracks for a folder reported absent, so an expired credential
// used to read as "the user deleted their library".

const mockRequest = jest.fn();

jest.mock("axios", () => ({
  request: (...args: unknown[]) => mockRequest(...args),
  isAxiosError: () => false,
  isCancel: () => false,
}));

const mockAuth = { url: "https://dav.example.com/remote.php/dav/files/joel" };
jest.mock("@/stores/auth", () => ({
  useAuthBase: { getState: () => mockAuth },
}));

jest.mock("@/services/serverHeaders", () => ({
  requestHeadersForUrl: () => ({ Authorization: "Basic xxx" }),
}));

import { webdavFileSource } from "@/services/fileSource/webdav";

const MULTISTATUS = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"></d:multistatus>`;

const answers = (status: number, data = "") => {
  mockRequest.mockResolvedValue({ status, data });
};

beforeEach(() => {
  mockRequest.mockReset();
  mockAuth.url = "https://dav.example.com/remote.php/dav/files/joel";
});

describe("webdavFileSource error classification", () => {
  it.each([
    [401, "ERR_FS_AUTH"],
    [403, "ERR_FS_AUTH"],
    [404, "ERR_FS_NOT_FOUND"],
    [405, "ERR_FS_NOT_SUPPORTED"],
    [501, "ERR_FS_NOT_SUPPORTED"],
    [302, "ERR_FS_NOT_SUPPORTED"],
    [500, "ERR_FS_SERVER"],
  ])("maps HTTP %i to %s", async (status, code) => {
    answers(status);
    await expect(webdavFileSource.list("webdav:/Music")).rejects.toMatchObject({
      code,
    });
  });

  it("treats a request that never got a response as unreachable", async () => {
    mockRequest.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(webdavFileSource.list("webdav:/Music")).rejects.toMatchObject({
      code: "ERR_FS_UNREACHABLE",
    });
  });

  // A captive portal or a plain web server can answer 207 to anything.
  it("rejects a 207 that isn't multistatus", async () => {
    answers(207, "<html>login</html>");
    await expect(webdavFileSource.list("webdav:/Music")).rejects.toMatchObject({
      code: "ERR_FS_NOT_SUPPORTED",
    });
  });
});

describe("webdavFileSource.exists", () => {
  it("is true for a share that answers with multistatus", async () => {
    answers(207, MULTISTATUS);
    expect(await webdavFileSource.exists("webdav:/Music")).toBe(true);
  });

  // The only case that may report absent — it's the one the prune acts on.
  it("is false only for a definitive 404", async () => {
    answers(404);
    expect(await webdavFileSource.exists("webdav:/Music")).toBe(false);
  });

  it.each([401, 403, 405, 500])(
    "throws rather than reporting absent on %i",
    async (status) => {
      answers(status);
      await expect(webdavFileSource.exists("webdav:/Music")).rejects.toThrow();
    },
  );

  it("throws rather than reporting absent when the host is unreachable", async () => {
    mockRequest.mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(
      webdavFileSource.exists("webdav:/Music"),
    ).rejects.toMatchObject({ code: "ERR_FS_UNREACHABLE" });
  });
});

describe("webdavFileSource.probe", () => {
  // Reachability is a yes/no by contract, so it keeps swallowing the reason —
  // unlike `exists`, nothing destructive keys off it.
  it.each([401, 404, 500])("is false on %i", async (status) => {
    answers(status);
    expect(await webdavFileSource.probe()).toBe(false);
  });

  it("is true on a multistatus answer", async () => {
    answers(207, MULTISTATUS);
    expect(await webdavFileSource.probe()).toBe(true);
  });
});

describe("webdavFileSource.list", () => {
  const listing = (href: string) =>
    `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">` +
    `<d:response><d:href>${href}</d:href><d:propstat>` +
    `<d:status>HTTP/1.1 200 OK</d:status>` +
    `<d:prop><d:resourcetype/><d:getcontentlength>7</d:getcontentlength></d:prop>` +
    `</d:propstat></d:response></d:multistatus>`;

  it("resolves entries under a share URL containing percent escapes", async () => {
    // The share root is the one path the server does not echo back to us
    // verbatim: hrefs come back decoded, so an undecoded base matched nothing
    // and every folder listed as empty — which the scanner reads as a library
    // the user deleted.
    mockAuth.url = "https://dav.example.com/remote.php/dav/files/jean%20dupont";
    answers(
      207,
      listing("/remote.php/dav/files/jean%20dupont/Album/track.flac"),
    );
    expect(await webdavFileSource.list("webdav:/Album")).toEqual([
      expect.objectContaining({ name: "track.flac", isDirectory: false }),
    ]);
  });
});
