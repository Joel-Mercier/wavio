# Single sign-on (OpenID Connect)

Wavio can sign into a **Navidrome** or **OpenSubsonic** server that sits behind an
OpenID Connect–aware reverse proxy. For the user it is: enter the server URL, and
Wavio switches to **Single sign-on** by itself when the server advertises it.
Then tap **Sign in with single sign-on** and log in at your identity provider
(IdP). No server password is needed. The switch also lives under **Advanced
settings → Single sign-on (OpenID Connect)**, on the sign-in screen and in the
add-server and edit-server forms, for servers that don't advertise it. Changing
it on a saved server applies from the next sign-in.

This page is for whoever runs the server. It describes what Wavio expects so
you can set up your identity provider (IdP) and proxy.

## How it works

1. The user enters `https://music.example.com`.
2. Wavio reads `https://music.example.com/.well-known/oauth-protected-resource`
   ([RFC 9728](https://www.rfc-editor.org/rfc/rfc9728)) to find your IdP.
3. Wavio runs the Authorization Code flow with PKCE (S256) in the system browser
   (Custom Tabs on Android, `ASWebAuthenticationSession` on iOS), as
   [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) requires for native apps.
4. Every request then carries `Authorization: Bearer <access token>`. That
   includes API calls, streams, cover art and downloads.
5. Your proxy validates the token, puts the user's name in a trusted header and
   forwards the request. Navidrome's
   [external authentication](https://www.navidrome.org/docs/usage/integration/authentication/)
   maps that header to an account.
6. Wavio refreshes the access token with its refresh token before it expires,
   including during background playback and in Android Auto.

## 1. Register Wavio at your IdP

| Setting | Value |
| --- | --- |
| Client ID | `wavio` (a different one can be set in the app, under *Advanced settings*) |
| Client type | **Public**: no client secret |
| Grant types | Authorization Code, Refresh Token |
| PKCE | Required, `S256` |
| Redirect URI | `com.jmercier.wavio:/oauth/callback` |
| Scopes | `openid profile offline_access` |

- **Test builds:** they use their own redirect URIs, so register these too if you use them:
  - `com.jmercier.wavio.dev:/oauth/callback` (development build)
  - `com.jmercier.wavio.preview:/oauth/callback` (preview build)
- **Refresh token:** `offline_access` is what makes the IdP issue a refresh token that outlives the browser session. Without one, the user has to sign in again whenever the access token expires.
- **Access-token lifetime:** 15 minutes or more is recommended. Shorter tokens work, but they mean more refreshes, and a seek after expiry in a long track has to reload the stream.
- **Audience:** your proxy will probably check the access token's audience (`aud`). Make sure tokens issued to `wavio` carry the audience the proxy expects (see the Keycloak recipe below).

## 2. Publish the protected-resource metadata

Serve this document **unauthenticated** at
`https://music.example.com/.well-known/oauth-protected-resource`. If Navidrome
lives under a path such as `https://example.com/navidrome`, serve it at
`https://example.com/.well-known/oauth-protected-resource/navidrome` instead.

```json
{
  "resource": "https://music.example.com",
  "authorization_servers": ["https://auth.example.com/realms/home"]
}
```

`resource` must be exactly the URL users type into Wavio. Only a trailing slash
may differ. Wavio ignores metadata that describes a different URL, so a
lookalike host can't send users to its own sign-in page.

If you can't publish this file, users can turn on **Advanced settings → Single
sign-on** and enter the issuer URL themselves.

## 3. Configure the proxy

The proxy must:

- **Accept bearer tokens** issued to Wavio on every path the app uses:
  - `/rest/*` (Subsonic API, streams, cover art)
  - `/api/*` (Navidrome's own API)
  - `/app/` (Wavio reads the signed-in user from this page)
- **Answer `401`, never a redirect to the login page,** when the token is missing or invalid on those paths. Wavio follows redirects like any HTTP client, ends up on your login page and can only report that the proxy redirected.
- **Set the user header** (e.g. `Remote-User`) from the token after it validates it.
- **Strip that header from every incoming request**, so a client can never set it itself.
- **Leave unauthenticated:**
  - `/.well-known/oauth-protected-resource`
  - `/share/*`, if you use Navidrome sharing

## 4. Configure Navidrome

```sh
ND_EXTAUTH_TRUSTEDSOURCES=172.20.0.10/32   # only the proxy that sets the header
ND_EXTAUTH_USERHEADER=Remote-User          # or whatever header the proxy sets
```

- **Trusted sources:** trust only the address of the component that validates the token. With `0.0.0.0/0`, anything that can reach Navidrome can impersonate any user.
- **New users:** Navidrome only creates accounts for proxy-authenticated users when its web page is served. Wavio requests that page during sign-in, so first-time users are created automatically. On other OpenSubsonic servers the account has to exist already.

## Example: Keycloak + oauth2-proxy + Caddy

This is the reference setup. Caddy strips the user header, serves the metadata
and `/share/*` directly, and sends everything else through oauth2-proxy.
oauth2-proxy validates the bearer token and forwards to Navidrome.

**Keycloak**, client `wavio`:
- *Client authentication* off (public).
- *Standard flow* on.
- *Valid redirect URIs*: `com.jmercier.wavio:/oauth/callback`.
- *Advanced → Proof Key for Code Exchange Code Challenge Method*: `S256`.
- Add an **Audience** mapper (*Included Client Audience* = `wavio`, *Add to access token* on). Without it, Keycloak's access tokens don't name `wavio` in `aud`, and oauth2-proxy rejects them.
- Users need the realm's `offline_access` role, which is part of the default roles. Users created normally have it. Users brought in by a realm import or a federation without default roles don't, and sign-in then fails with "Offline tokens not allowed for the user or client".

**oauth2-proxy** (its own Keycloak client handles browser logins; Wavio's tokens
are accepted as extra JWT issuers):

```sh
oauth2-proxy \
  --provider=keycloak-oidc \
  --oidc-issuer-url=https://auth.example.com/realms/home \
  --client-id=oauth2-proxy --client-secret=… --cookie-secret=… \
  --email-domain='*' \
  --upstream=http://navidrome:4533 \
  --skip-jwt-bearer-tokens=true \
  --extra-jwt-issuers=https://auth.example.com/realms/home=wavio \
  --api-route='^/rest/' --api-route='^/api/' \
  --pass-user-headers=true \
  --http-address=0.0.0.0:4180
```

**Navidrome**:

```sh
ND_EXTAUTH_TRUSTEDSOURCES=<oauth2-proxy container IP>/32
ND_EXTAUTH_USERHEADER=X-Forwarded-Preferred-Username
```

**Caddy**:

```caddy
music.example.com {
	request_header -X-Forwarded-Preferred-Username
	request_header -Remote-User

	handle /.well-known/oauth-protected-resource {
		header Content-Type application/json
		respond `{"resource":"https://music.example.com","authorization_servers":["https://auth.example.com/realms/home"]}`
	}
	handle /share/* {
		reverse_proxy navidrome:4533
	}
	handle {
		reverse_proxy oauth2-proxy:4180
	}
}
```

Requests from Caddy itself (`/share/*`) don't come from the trusted oauth2-proxy
address, so Navidrome never applies external auth to them.

## Other identity providers

- **Authentik:**
  - Use an OAuth2/OpenID provider with *Client type* Public, a strict redirect URI as above, and the `offline_access` scope mapping (needed for a refresh token since 2024.2).
  - Its proxy outpost only accepts bearer JWTs issued for the proxy provider, so check [authentik's header authentication docs](https://docs.goauthentik.io/add-secure-apps/providers/proxy/header_authentication/) for how your version validates tokens from another provider.
  - An oauth2-proxy setup like the one above also works in front of Authentik.
- **Authelia: not supported yet.**
  - Authelia only accepts `http(s)` redirect URIs, not an app's redirect scheme.
  - Its bearer-token forward-auth also requires PAR and `form_post`, which need a different sign-in mechanism in the app.

## Limitations

- **Casting:** Chromecast and UPnP/DLNA are not offered on single-sign-on servers. A receiver fetches the stream URL itself and can't send the access token. Jukebox mode still works.
- **Server types:** Jellyfin servers and WebDAV shares are not supported. Both use the `Authorization` header for their own sign-in.
- **App killed during sign-in:** if Android kills Wavio while the browser is open, the sign-in can't complete and has to be started again.
- **Signing out:** signing out of Wavio revokes its refresh token at the IdP (when the IdP has a revocation endpoint). Switching servers keeps it, so switching back doesn't need a new sign-in.
