#!/usr/bin/env python3
"""
A fake UPnP/DLNA MediaRenderer, for developing Wavio's casting without owning one.

It answers SSDP discovery, serves a device description advertising AVTransport and
RenderingControl, and implements the SOAP actions the app drives. It plays nothing:
it runs a clock and reports positions, which is all the app can observe anyway.

Two things it does that a real renderer cannot:

  * it prints the raw CurrentURI, the DIDL-Lite and every SOAP envelope it is handed,
    so the metadata can be read directly instead of inferred from whether a speaker
    made noise;
  * it fetches the stream URL it was given and reports the status and Content-Type,
    which is how you find out that the URL the app builds is reachable by something
    that is not the phone.

Real renderers are non-compliant in ways that only show up one device at a time, so
each known misbehaviour is a flag here (see --help). The defaults are a well-behaved
renderer.

    python3 mock-upnp-renderer.py --name "Kitchen"
    python3 mock-upnp-renderer.py --reject-didl --stop-early 4
    python3 mock-upnp-renderer.py --async-transition --ignore-uri-while-playing

Sonos group members refuse playback and redirect to a coordinator, which takes two
devices to reproduce:

    python3 mock-upnp-renderer.py --name Coordinator --port 8060
    python3 mock-upnp-renderer.py --name Member --port 8061 \
        --sonos-member http://192.168.1.20:8060/description.xml

Requires nothing but the standard library. Must run on the host itself, not in Docker
Desktop on macOS: that NATs through a VM and SSDP multicast never arrives.
"""

import argparse
import http.server
import re
import socket
import socketserver
import ssl
import struct
import sys
import threading
import time
import urllib.request
import uuid

SSDP_ADDR = "239.255.255.250"
SSDP_PORT = 1900
AVT = "urn:schemas-upnp-org:service:AVTransport:1"
RC = "urn:schemas-upnp-org:service:RenderingControl:1"
ZGT = "urn:schemas-upnp-org:service:ZoneGroupTopology:1"


def log(section, message):
    print(f"\033[36m[{time.strftime('%H:%M:%S')}] {section}\033[0m {message}", flush=True)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 53))
        return s.getsockname()[0]
    finally:
        s.close()


def hms(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 3600}:{(seconds % 3600) // 60:02d}:{seconds % 60:02d}"


def parse_hms(text):
    parts = (text or "").strip().split(":")
    try:
        parts = [float(p) for p in parts]
    except ValueError:
        return 0
    total = 0
    for part in parts:
        total = total * 60 + part
    return total


def xml_unescape(text):
    for a, b in (("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&")):
        text = text.replace(a, b)
    return text


def tag(body, name):
    m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", body, re.S)
    return m.group(1).strip() if m else ""


# ── The renderer's state ──────────────────────────────────────────────────────


class Renderer:
    """Transport state plus a clock. Position advances only while PLAYING."""

    def __init__(self, args):
        self.args = args
        self.lock = threading.Lock()
        self.state = "STOPPED"
        self.status = "OK"
        self.uri = ""
        self.metadata = ""
        self.duration = 0
        self.volume = 30
        self._base = 0.0
        self._base_at = time.monotonic()
        self._remote_stopped = False
        # --async-transition: the handover a real renderer performs over a second
        # or two, during which it keeps answering about the previous track.
        self._pending = None
        self._play_requested = False

    def position(self):
        if self.state == "PLAYING":
            return self._base + (time.monotonic() - self._base_at)
        return self._base

    def _set(self, state, position=None):
        if position is None:
            position = self.position()
        self._base = max(0.0, position)
        self._base_at = time.monotonic()
        if state != self.state:
            log("STATE", f"{self.state} -> \033[1m{state}\033[0m at {hms(self._base)}")
        self.state = state

    def load(self, uri, metadata, duration):
        with self.lock:
            self.status = "OK"
            if self.args.async_transition:
                self._pending = (uri, metadata, duration)
                self._play_requested = self.args.autoplay
                threading.Thread(target=self._transition, daemon=True).start()
                return
            self._apply(uri, metadata, duration)

    def _apply(self, uri, metadata, duration):
        self.uri = uri
        self.metadata = metadata
        self.duration = duration
        self._remote_stopped = False
        self._set("PLAYING" if self.args.autoplay else "STOPPED", 0)

    def _transition(self):
        """PLAYING(old) -> STOPPED(old) -> TRANSITIONING(old) -> PLAYING(new), slowly.

        What an Android TV does with a SetAVTransportURI: says yes at once, then
        takes its time, and every poll in between describes the track it is
        leaving. A controller that believes those polls sees the old track "end"
        right after handing over the new one.
        """
        time.sleep(0.5)
        with self.lock:
            if self._pending is None:
                return
            log("TRANSITION", "stopping the previous track")
            self._set("STOPPED")
        time.sleep(0.5)
        with self.lock:
            if self._pending is None:
                return
            log("TRANSITION", "TRANSITIONING (still reporting the previous URI)")
            self._set("TRANSITIONING")
        time.sleep(0.5)
        with self.lock:
            if self._pending is None:
                return
            uri, metadata, duration = self._pending
            self._pending = None
            self.uri = uri
            self.metadata = metadata
            self.duration = duration
            self._set("PLAYING" if self._play_requested else "STOPPED", 0)
            self._play_requested = False

    def play(self):
        with self.lock:
            if self._pending is not None:
                self._play_requested = True
                log("PLAY", "noted; the handover is still in progress")
                return
            if self.state == "STOPPED" and self.args.no_pause:
                # Stopped is stopped: playing again starts from the top, which is
                # what makes losing Pause cost more than it looks.
                self._set("PLAYING", 0)
                return
            self._set("PLAYING")

    def fail(self):
        """The stream could not be fetched: stop, and say so in the status."""
        with self.lock:
            self.status = "ERROR_OCCURRED"
            self._set("STOPPED", 0)

    def pause(self):
        with self.lock:
            self._set("PAUSED")

    def stop(self):
        with self.lock:
            self._pending = None
            self._set("STOPPED", 0)

    def seek(self, seconds):
        with self.lock:
            log("SEEK", f"-> {hms(seconds)}")
            self._set(self.state, seconds)

    def tick(self):
        """Ends the track once the clock runs out.

        --stop-early reproduces the renderers that stop reporting a little before the
        end, which is what makes a tight end-of-track window fail to advance a queue.
        """
        with self.lock:
            if self.state != "PLAYING" or self.duration <= 0:
                return
            if self.args.stop_at and not self._remote_stopped and self.position() >= self.args.stop_at:
                # A hand on the renderer's own remote (Kodi): STOPPED, position back to
                # zero, the URI still loaded, and the next Play starts from the top.
                self._remote_stopped = True
                log("TRACK", f"\033[33m--stop-at: stopped from the renderer's own remote at {hms(self.position())}\033[0m")
                self._set("STOPPED", 0)
                return
            if self.position() >= self.duration - self.args.stop_early:
                log("TRACK", f"reached the end ({hms(self.duration)}), reporting STOPPED")
                self._set("STOPPED", self.duration)


# ── What the app hands us ─────────────────────────────────────────────────────


def describe_handoff(uri, metadata):
    log("LOAD", f"CurrentURI: \033[1m{uri}\033[0m")
    if not metadata:
        log("LOAD", "\033[33mno CurrentURIMetaData — the renderer is left to guess\033[0m")
        return None
    didl = xml_unescape(metadata)
    upnp_class = tag(didl, "upnp:class")
    protocol = re.search(r'protocolInfo="(.*?)"', didl)
    protocol = protocol.group(1) if protocol else ""
    duration = re.search(r'duration="(.*?)"', didl)
    # Text inside the DIDL is escaped once on its own account, and the whole DIDL is
    # escaped again to ride inside CurrentURIMetaData. Undo both, or every apostrophe
    # in a track title reads as a bug in the sender.
    field = lambda name: xml_unescape(tag(didl, name))
    log("LOAD", f"  title    {field('dc:title')!r}")
    log("LOAD", f"  artist   {field('upnp:artist')!r}")
    log("LOAD", f"  album    {field('upnp:album')!r}")
    log("LOAD", f"  art      {field('upnp:albumArtURI')!r}")
    log("LOAD", f"  duration {duration.group(1) if duration else '(absent)'}")
    warn = "" if upnp_class.startswith("object.item.audioItem") else "  \033[31m<- not audio!\033[0m"
    log("LOAD", f"  class    {upnp_class}{warn}")
    log("LOAD", f"  protocol {protocol}")
    return protocol


def probe_stream(uri, renderer=None):
    """Fetch what we were handed, the way a renderer would.

    The whole design rests on the app's stream URLs being self-contained — auth in the
    query string — so that something which is not the phone can fetch them. This is
    where that stops being an assumption. With --error-status a failed fetch is
    reported back the way a renderer reports it: STOPPED, with ERROR_OCCURRED.
    """
    failed = lambda: renderer.fail() if renderer is not None else None
    if uri.startswith("file://"):
        log("FETCH", "\033[31mfile:// — no renderer on earth can reach this\033[0m")
        failed()
        return
    request = urllib.request.Request(uri, headers={"Range": "bytes=0-2047", "User-Agent": "MockRenderer/1.0"})
    for context in (None, ssl._create_unverified_context()):
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=context) if context else urllib.request.HTTPSHandler()
        )
        try:
            with opener.open(request, timeout=10) as response:
                body = response.read(2048)
                kind = response.headers.get("Content-Type", "(none)")
                length = response.headers.get("Content-Length", "(none)")
                note = " \033[33m(only with certificate checks off)\033[0m" if context else ""
                log("FETCH", f"\033[32m{response.status}\033[0m {kind}, {length} bytes, read {len(body)}{note}")
            return
        except ssl.SSLError as e:
            if context:
                log("FETCH", f"\033[31mTLS failed: {e}\033[0m")
                failed()
                return
        except Exception as e:
            log("FETCH", f"\033[31mfailed: {type(e).__name__}: {e}\033[0m")
            failed()
            return


# ── SOAP ──────────────────────────────────────────────────────────────────────


def envelope(service, action, body):
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" '
        's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>'
        f'<u:{action}Response xmlns:u="{service}">{body}</u:{action}Response>'
        "</s:Body></s:Envelope>"
    ).encode()


def fault(code, description):
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault>'
        "<faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail>"
        '<UPnPError xmlns="urn:schemas-upnp-org:control-1-0">'
        f"<errorCode>{code}</errorCode><errorDescription>{description}</errorDescription>"
        "</UPnPError></detail></s:Fault></s:Body></s:Envelope>"
    ).encode()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *args):
        pass

    def _send(self, status, body, content_type="text/xml; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        log("HTTP", f"GET {self.path} from {self.client_address[0]}")
        if self.path.rstrip("/") in ("/description.xml", "/description"):
            self._send(200, self.server.description.encode())
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", "ignore")
        action = (self.headers.get("SOAPAction") or "").strip('"').split("#")[-1]
        log("SOAP", f"{action} on {self.path}")
        if self.server.args.verbose:
            print(body, flush=True)
        if self.server.args.slow_soap:
            time.sleep(self.server.args.slow_soap / 1000)
        try:
            status, payload = self.server.dispatch(action, body)
        except Exception as e:  # a mock that crashes teaches nothing
            log("SOAP", f"\033[31mhandler blew up: {e}\033[0m")
            status, payload = 500, fault(501, "Action Failed")
        self._send(status, payload)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, addr, args, renderer, description, udn, coordinator):
        super().__init__(addr, Handler)
        self.args = args
        self.renderer = renderer
        self.description = description
        self.udn = udn
        self.coordinator = coordinator

    def dispatch(self, action, body):
        r = self.renderer
        args = self.args

        if action == "SetAVTransportURI":
            uri = xml_unescape(tag(body, "CurrentURI"))
            metadata = tag(body, "CurrentURIMetaData")
            protocol = describe_handoff(uri, metadata)

            if args.sonos_member:
                log("REFUSE", "\033[33mnot the group coordinator (pretending to be Sonos)\033[0m")
                return 500, fault(701, "Transition not available")
            if args.reject_didl and metadata:
                log("REFUSE", "\033[33m--reject-didl: refusing anything with metadata\033[0m")
                return 500, fault(714, "Illegal MIME-type")
            if args.reject_mime and protocol and args.reject_mime in protocol:
                log("REFUSE", f"\033[33m--reject-mime: refusing {args.reject_mime}\033[0m")
                return 500, fault(714, "Illegal MIME-type")
            if args.refuse_uri_while_playing and r.state != "STOPPED":
                log("REFUSE", f"\033[33m--refuse-uri-while-playing: {r.state}, send Stop first\033[0m")
                return 500, fault(705, "Transition not available")
            if args.ignore_uri_while_playing and r.state == "PLAYING":
                # The lie that costs the most: accepted, and nothing happens. A
                # Play that follows replays whatever was already loaded.
                log("REFUSE", "\033[33m--ignore-uri-while-playing: saying yes, keeping the old track\033[0m")
                return 200, envelope(AVT, action, "")

            duration = args.duration
            if not duration and metadata:
                m = re.search(r'duration="(.*?)"', xml_unescape(metadata))
                if m:
                    duration = parse_hms(m.group(1))
            r.load(uri, metadata, duration or 30)
            threading.Thread(
                target=probe_stream, args=(uri, r if args.error_status else None), daemon=True
            ).start()
            return 200, envelope(AVT, action, "")

        if action == "SetNextAVTransportURI":
            log("LOAD", f"next: {xml_unescape(tag(body, 'NextURI'))}")
            return 200, envelope(AVT, action, "")

        if action == "Play":
            r.play()
            return 200, envelope(AVT, action, "")
        if action == "Pause":
            if args.no_pause:
                log("REFUSE", "\033[33m--no-pause: this renderer only knows Stop\033[0m")
                return 500, fault(401, "Invalid Action")
            r.pause()
            return 200, envelope(AVT, action, "")
        if action == "Stop":
            r.stop()
            return 200, envelope(AVT, action, "")
        if action == "Seek":
            r.seek(parse_hms(tag(body, "Target")))
            return 200, envelope(AVT, action, "")

        if action == "GetTransportInfo":
            return 200, envelope(
                AVT,
                action,
                f"<CurrentTransportState>{r.state}</CurrentTransportState>"
                f"<CurrentTransportStatus>{r.status}</CurrentTransportStatus>"
                "<CurrentSpeed>1</CurrentSpeed>",
            )

        if action == "GetPositionInfo":
            return 200, envelope(
                AVT,
                action,
                f"<Track>1</Track><TrackDuration>{hms(r.duration)}</TrackDuration>"
                f"<TrackMetaData>{r.metadata}</TrackMetaData>"
                f"<TrackURI>{'' if args.no_track_uri else r.uri}</TrackURI>"
                f"<RelTime>{hms(r.position())}</RelTime><AbsTime>{hms(r.position())}</AbsTime>"
                "<RelCount>2147483647</RelCount><AbsCount>2147483647</AbsCount>",
            )

        if action == "SetVolume":
            r.volume = int(tag(body, "DesiredVolume") or 0)
            log("VOLUME", f"-> {r.volume}")
            return 200, envelope(RC, action, "")
        if action == "GetVolume":
            return 200, envelope(RC, action, f"<CurrentVolume>{r.volume}</CurrentVolume>")

        if action == "GetZoneGroupState":
            return 200, envelope(ZGT, action, f"<ZoneGroupState>{self.coordinator}</ZoneGroupState>")

        log("SOAP", f"\033[33munhandled action {action}\033[0m")
        return 500, fault(401, "Invalid Action")


# ── Discovery ─────────────────────────────────────────────────────────────────


def description_xml(name, udn, sonos, base):
    services = [
        (AVT, "AVTransport", "/AVTransport/control"),
        (RC, "RenderingControl", "/RenderingControl/control"),
    ]
    if sonos:
        services.append((ZGT, "ZoneGroupTopology", "/ZoneGroupTopology/control"))
    blocks = "".join(
        f"<service><serviceType>{t}</serviceType>"
        f"<serviceId>urn:upnp-org:serviceId:{sid}</serviceId>"
        f"<controlURL>{url}</controlURL>"
        f"<eventSubURL>{url}/event</eventSubURL>"
        f"<SCPDURL>{url}/scpd.xml</SCPDURL></service>"
        for t, sid, url in services
    )
    model = "Sonos Play:1" if sonos else "Wavio Mock Renderer"
    return (
        '<?xml version="1.0"?>'
        '<root xmlns="urn:schemas-upnp-org:device-1-0">'
        "<specVersion><major>1</major><minor>0</minor></specVersion>"
        f"<URLBase>{base}</URLBase>"
        "<device>"
        "<deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>"
        f"<friendlyName>{name}</friendlyName>"
        f"<manufacturer>{'Sonos, Inc.' if sonos else 'Wavio'}</manufacturer>"
        f"<modelName>{model}</modelName>"
        f"<UDN>uuid:{udn}</UDN>"
        f"<serviceList>{blocks}</serviceList>"
        "</device></root>"
    )


def zone_group_state(member_udn, coordinator_udn, coordinator_location):
    """A topology where this speaker is a member and someone else is in charge."""
    escaped = coordinator_location.replace("&", "&amp;")
    return (
        "&lt;ZoneGroups&gt;&lt;ZoneGroup Coordinator=&quot;"
        + coordinator_udn
        + "&quot; ID=&quot;"
        + coordinator_udn
        + ":1&quot;&gt;&lt;ZoneGroupMember UUID=&quot;"
        + coordinator_udn
        + "&quot; ZoneName=&quot;Coordinator&quot; Location=&quot;"
        + escaped.replace("&", "&amp;")
        + "&quot;/&gt;&lt;ZoneGroupMember UUID=&quot;"
        + member_udn
        + "&quot; ZoneName=&quot;Member&quot;/&gt;&lt;/ZoneGroup&gt;&lt;/ZoneGroups&gt;"
    )


def ssdp_responder(args, location, udn, stop):
    """Answers M-SEARCH.

    Replies go back unicast to whoever asked, so a controller needs no multicast
    membership of its own — only we do, to hear the question.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if hasattr(socket, "SO_REUSEPORT"):
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
    try:
        sock.bind(("", SSDP_PORT))
    except OSError as e:
        print(f"cannot bind UDP {SSDP_PORT}: {e}", file=sys.stderr)
        print("something else is already answering SSDP on this machine.", file=sys.stderr)
        return
    sock.setsockopt(
        socket.IPPROTO_IP,
        socket.IP_ADD_MEMBERSHIP,
        struct.pack("4s4s", socket.inet_aton(SSDP_ADDR), socket.inet_aton(args.bind)),
    )
    sock.settimeout(1)
    log("SSDP", f"listening on {SSDP_ADDR}:{SSDP_PORT}")

    seen = 0
    while not stop.is_set():
        try:
            data, addr = sock.recvfrom(4096)
        except socket.timeout:
            continue
        text = data.decode("utf-8", "ignore")
        if not text.upper().startswith("M-SEARCH"):
            continue
        st = next(
            (line.split(":", 1)[1].strip() for line in text.splitlines() if line.lower().startswith("st:")),
            "",
        )
        if st not in ("ssdp:all", "upnp:rootdevice", "urn:schemas-upnp-org:device:MediaRenderer:1", AVT):
            continue
        seen += 1
        if args.notify_only:
            log("SSDP", f"\033[33m--notify-only: ignoring search #{seen} from {addr[0]}\033[0m")
            continue
        if args.flaky_discovery and seen % 2 == 0:
            log("SSDP", f"\033[33m--flaky-discovery: ignoring search #{seen} from {addr[0]}\033[0m")
            continue
        if args.reply_delay:
            log("SSDP", f"--reply-delay: answering {addr[0]} in {args.reply_delay}s")
            time.sleep(args.reply_delay)
        replies = 2 if args.duplicate_names else 1
        for i in range(replies):
            reply = (
                "HTTP/1.1 200 OK\r\n"
                "CACHE-CONTROL: max-age=1800\r\n"
                "EXT:\r\n"
                f"LOCATION: {location}\r\n"
                "SERVER: MockOS/1.0 UPnP/1.0 MockRenderer/1.0\r\n"
                f"ST: {'upnp:rootdevice' if i else 'urn:schemas-upnp-org:device:MediaRenderer:1'}\r\n"
                f"USN: uuid:{udn}::{'upnp:rootdevice' if i else 'urn:schemas-upnp-org:device:MediaRenderer:1'}\r\n"
                "\r\n"
            ).encode()
            sock.sendto(reply, addr)
        log("SSDP", f"answered {addr[0]} (ST {st}){' x2' if replies > 1 else ''}")
    sock.close()


def ssdp_announcer(args, location, udn, stop):
    """Multicasts ssdp:alive on a schedule, the way a renderer announces itself.

    A controller that only ever asks (M-SEARCH) and never listens misses every
    device that answers searches badly but announces itself well — which is a
    fair description of a TV that has just woken up.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(args.bind))
    while not stop.is_set():
        for nt in ("upnp:rootdevice", "urn:schemas-upnp-org:device:MediaRenderer:1", AVT):
            notice = (
                "NOTIFY * HTTP/1.1\r\n"
                f"HOST: {SSDP_ADDR}:{SSDP_PORT}\r\n"
                "CACHE-CONTROL: max-age=1800\r\n"
                f"LOCATION: {location}\r\n"
                f"NT: {nt}\r\n"
                "NTS: ssdp:alive\r\n"
                "SERVER: MockOS/1.0 UPnP/1.0 MockRenderer/1.0\r\n"
                f"USN: uuid:{udn}::{nt}\r\n"
                "\r\n"
            ).encode()
            sock.sendto(notice, (SSDP_ADDR, SSDP_PORT))
        log("SSDP", f"announced ssdp:alive (every {args.notify_every}s)")
        stop.wait(args.notify_every)
    sock.close()


def coordinator_udn(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        xml = response.read().decode("utf-8", "ignore")
    m = re.search(r"<UDN>\s*(?:uuid:)?(.*?)</UDN>", xml, re.S)
    if not m:
        raise SystemExit(f"no UDN in the coordinator description at {url}")
    return m.group(1).strip()


def main():
    p = argparse.ArgumentParser(
        description="A fake UPnP/DLNA renderer for developing Wavio casting.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--name", default="Wavio Mock Renderer", help="friendlyName shown in the app")
    p.add_argument("--port", type=int, default=8060, help="HTTP port (default 8060)")
    p.add_argument("--bind", default=None, help="LAN address to advertise (default: auto)")
    p.add_argument("--udn", default=None, help="fixed UDN, so a restart looks like the same device (default: random)")
    p.add_argument("--duration", type=float, default=0, help="override track length, seconds")
    p.add_argument("-v", "--verbose", action="store_true", help="print every SOAP envelope")

    q = p.add_argument_group("quirks (each reproduces a real renderer's misbehaviour)")
    q.add_argument("--autoplay", action="store_true", help="start on SetAVTransportURI, without waiting for Play")
    q.add_argument("--reject-didl", action="store_true", help="refuse any SetAVTransportURI carrying metadata")
    q.add_argument("--reject-mime", metavar="MIME", help="refuse this MIME, e.g. audio/flac")
    q.add_argument("--stop-early", type=float, default=0, metavar="SEC", help="report STOPPED this early")
    q.add_argument("--stop-at", type=float, default=0, metavar="SEC",
                   help="once per track, stop from the renderer's own remote at this position (Kodi)")
    q.add_argument("--no-track-uri", action="store_true", help="never report TrackURI in GetPositionInfo")
    q.add_argument("--flaky-discovery", action="store_true", help="answer only every other M-SEARCH")
    q.add_argument("--duplicate-names", action="store_true", help="send two SSDP replies per search")
    q.add_argument("--sonos-member", metavar="URL", help="refuse playback, point at this coordinator's description")
    q.add_argument("--async-transition", action="store_true",
                   help="take ~1.5s over a handover, reporting the previous track meanwhile")
    q.add_argument("--refuse-uri-while-playing", action="store_true",
                   help="705 on SetAVTransportURI unless STOPPED")
    q.add_argument("--ignore-uri-while-playing", action="store_true",
                   help="accept SetAVTransportURI while PLAYING but keep the old track")
    q.add_argument("--no-pause", action="store_true",
                   help="refuse Pause (only Stop), and restart from 0 on Play after Stop")
    q.add_argument("--slow-soap", type=int, default=0, metavar="MS", help="delay every SOAP answer")
    q.add_argument("--error-status", action="store_true",
                   help="report STOPPED + ERROR_OCCURRED when the stream cannot be fetched")
    q.add_argument("--notify-only", action="store_true",
                   help="never answer M-SEARCH; announce ssdp:alive instead")
    q.add_argument("--notify-every", type=float, default=5, metavar="SEC",
                   help="ssdp:alive interval (default 5; announcements run with --notify-only)")
    q.add_argument("--reply-delay", type=float, default=0, metavar="SEC", help="answer M-SEARCH this late")

    args = p.parse_args()
    args.bind = args.bind or lan_ip()

    udn = args.udn or str(uuid.uuid4())
    base = f"http://{args.bind}:{args.port}"
    location = f"{base}/description.xml"
    sonos = bool(args.sonos_member)
    description = description_xml(args.name, udn, sonos, base)
    topology = ""
    if sonos:
        other = coordinator_udn(args.sonos_member)
        topology = zone_group_state(udn, other, args.sonos_member)
        log("SONOS", f"pretending to be a member; coordinator is {other}")

    renderer = Renderer(args)
    server = Server(("", args.port), args, renderer, description, udn, topology)

    stop = threading.Event()
    threading.Thread(target=ssdp_responder, args=(args, location, udn, stop), daemon=True).start()
    if args.notify_only:
        threading.Thread(target=ssdp_announcer, args=(args, location, udn, stop), daemon=True).start()
    threading.Thread(target=server.serve_forever, daemon=True).start()

    quirks = [
        n
        for n in (
            "autoplay", "reject_didl", "flaky_discovery", "duplicate_names", "no_track_uri",
            "async_transition", "refuse_uri_while_playing", "ignore_uri_while_playing",
            "no_pause", "error_status", "notify_only",
        )
        if getattr(args, n)
    ]
    if args.reject_mime:
        quirks.append(f"reject_mime={args.reject_mime}")
    if args.stop_early:
        quirks.append(f"stop_early={args.stop_early}s")
    if args.stop_at:
        quirks.append(f"stop_at={args.stop_at}s")
    if args.slow_soap:
        quirks.append(f"slow_soap={args.slow_soap}ms")
    if args.reply_delay:
        quirks.append(f"reply_delay={args.reply_delay}s")
    if sonos:
        quirks.append("sonos_member")
    log("READY", f"\033[1m{args.name}\033[0m at {location}")
    log("READY", f"quirks: {', '.join(quirks) if quirks else 'none (a well-behaved renderer)'}")

    try:
        while True:
            renderer.tick()
            time.sleep(0.25)
    except KeyboardInterrupt:
        log("BYE", "shutting down")
        stop.set()


if __name__ == "__main__":
    main()
