import axios from "axios";

// React Native's networking (OkHttp on Android) only transparently decodes
// `gzip`. A reverse proxy that negotiates `br` (e.g. Caddy) returns
// `Content-Encoding: br`, which axios then can't parse — a request succeeds at
// the HTTP level but the body comes back as undecodable bytes, surfacing as a
// failed login/parse against a proxied server while a browser (which decodes
// Brotli natively) works fine. Force `identity` on every axios instance so
// responses always arrive uncompressed and parseable, at the cost of dropping
// response compression. Set on the shared defaults so instances created via
// `axios.create` inherit it.
axios.defaults.headers.common["Accept-Encoding"] = "identity";
