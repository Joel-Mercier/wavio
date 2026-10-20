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

A Sonos household is one process: a speaker per room, each on its own port with its
own description, sharing one group topology. Grouping (x-rincon: joins, leaving,
coordinator-only transport, group volume from a snapshot, hidden stereo-pair halves)
is answered the way sonos.svrooij.io and SoCo document it. Type commands on stdin to
regroup or unplug rooms behind the app's back, the way the Sonos app would:

    python3 mock-upnp-renderer.py --sonos-rooms "Living Room,Kitchen,Bedroom" \
        --stereo-pair "Living Room" --group "Kitchen>Living Room" --dashboard 5

Requires nothing but the standard library. Must run on the host itself, not in Docker
Desktop on macOS: that NATs through a VM and SSDP multicast never arrives.
"""

import argparse
import hashlib
import http.server
import re
import shlex
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

    def __init__(self, args, label=""):
        self.args = args
        self.label = label
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
            log(f"{self.label}STATE", f"{self.state} -> \033[1m{state}\033[0m at {hms(self._base)}")
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
                log(f"{self.label}TRACK", f"\033[33m--stop-at: stopped from the renderer's own remote at {hms(self.position())}\033[0m")
                self._set("STOPPED", 0)
                return
            if self.position() >= self.duration - self.args.stop_early:
                log(f"{self.label}TRACK", f"reached the end ({hms(self.duration)}), reporting STOPPED")
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

    def _offline(self):
        # A speaker that has dropped off the network: the connection opens (the port
        # is still bound) and closes with no answer, which the app reads as silence.
        if self.server.offline():
            self.close_connection = True
            return True
        return False

    def do_GET(self):
        if self._offline():
            return
        log(self.server.label + "HTTP", f"GET {self.path} from {self.client_address[0]}")
        if self.path.rstrip("/") in ("/description.xml", "/description", "/xml/device_description.xml"):
            self._send(200, self.server.description.encode())
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8", "ignore")
        if self._offline():
            return
        action = (self.headers.get("SOAPAction") or "").strip('"').split("#")[-1]
        log(self.server.label + "SOAP", f"{action} on {self.path}")
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

    label = ""

    def __init__(self, addr, args, renderer, description, udn):
        super().__init__(addr, Handler)
        self.args = args
        self.renderer = renderer
        self.description = description
        self.udn = udn

    def offline(self):
        return False

    def dispatch(self, action, body):
        r = self.renderer
        args = self.args

        if action == "SetAVTransportURI":
            uri = xml_unescape(tag(body, "CurrentURI"))
            metadata = tag(body, "CurrentURIMetaData")
            protocol = describe_handoff(uri, metadata)

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

        log("SOAP", f"\033[33munhandled action {action}\033[0m")
        return 500, fault(401, "Invalid Action")


# ── Discovery ─────────────────────────────────────────────────────────────────

MEDIA_RENDERER = "urn:schemas-upnp-org:device:MediaRenderer:1"
ZONE_PLAYER = "urn:schemas-upnp-org:device:ZonePlayer:1"


def service_list(services):
    return "".join(
        f"<service><serviceType>{t}</serviceType>"
        f"<serviceId>urn:upnp-org:serviceId:{sid}</serviceId>"
        f"<controlURL>{url}</controlURL>"
        f"<eventSubURL>{url.rsplit('/', 1)[0]}/Event</eventSubURL>"
        f"<SCPDURL>{url.rsplit('/', 1)[0]}/scpd.xml</SCPDURL></service>"
        for t, sid, url in services
    )


def description_xml(name, udn, base):
    services = [
        (AVT, "AVTransport", "/AVTransport/control"),
        (RC, "RenderingControl", "/RenderingControl/control"),
    ]
    return (
        '<?xml version="1.0"?>'
        '<root xmlns="urn:schemas-upnp-org:device-1-0">'
        "<specVersion><major>1</major><minor>0</minor></specVersion>"
        f"<URLBase>{base}</URLBase>"
        "<device>"
        f"<deviceType>{MEDIA_RENDERER}</deviceType>"
        f"<friendlyName>{name}</friendlyName>"
        "<manufacturer>Wavio</manufacturer>"
        "<modelName>Wavio Mock Renderer</modelName>"
        f"<UDN>uuid:{udn}</UDN>"
        f"<serviceList>{service_list(services)}</serviceList>"
        "</device></root>"
    )


def ssdp_responder(args, targets, stop):
    """Answers M-SEARCH for every device `targets()` lists, as (location, udn) pairs.

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
        if st not in ("ssdp:all", "upnp:rootdevice", MEDIA_RENDERER, ZONE_PLAYER, AVT):
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
        devices = targets()
        for location, udn in devices:
            for i in range(replies):
                kind = "upnp:rootdevice" if i else MEDIA_RENDERER
                reply = (
                    "HTTP/1.1 200 OK\r\n"
                    "CACHE-CONTROL: max-age=1800\r\n"
                    "EXT:\r\n"
                    f"LOCATION: {location}\r\n"
                    "SERVER: MockOS/1.0 UPnP/1.0 MockRenderer/1.0\r\n"
                    f"ST: {kind}\r\n"
                    f"USN: uuid:{udn}::{kind}\r\n"
                    "\r\n"
                ).encode()
                sock.sendto(reply, addr)
        many = f" for {len(devices)} devices" if len(devices) > 1 else ""
        log("SSDP", f"answered {addr[0]} (ST {st}){many}{' x2' if replies > 1 else ''}")
    sock.close()


def ssdp_announcer(args, targets, stop):
    """Multicasts ssdp:alive on a schedule, the way a renderer announces itself.

    A controller that only ever asks (M-SEARCH) and never listens misses every
    device that answers searches badly but announces itself well — which is a
    fair description of a TV that has just woken up.
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_IF, socket.inet_aton(args.bind))
    while not stop.is_set():
        for location, udn in targets():
            for nt in ("upnp:rootdevice", MEDIA_RENDERER, AVT):
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


# ── A Sonos household ─────────────────────────────────────────────────────────
#
# Modelled on what sonos.svrooij.io and SoCo document, not on a real speaker, so the
# least certain parts are named where they happen: what a member answers when handed
# a track, and what the rest of a group does when its coordinator leaves.

GRC = "urn:schemas-upnp-org:service:GroupRenderingControl:1"
DP = "urn:schemas-upnp-org:service:DeviceProperties:1"
CM = "urn:schemas-upnp-org:service:ConnectionManager:1"
CD = "urn:schemas-upnp-org:service:ContentDirectory:1"
SONOS_MODEL = "Sonos One"


def xml_escape(text):
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def rincon(room):
    """A stable Sonos id for a room: RINCON_, a MAC, and the port every Sonos uses."""
    return f"RINCON_{hashlib.md5(room.encode()).hexdigest()[:12].upper()}01400"


class Player:
    """One speaker. Its own clock only matters while it coordinates a group."""

    def __init__(self, args, room, port, pair_of=None):
        self.room = room
        self.port = port
        # The invisible right half of a stereo pair: it answers discovery like any
        # speaker, and appears nowhere in the Sonos app.
        self.pair_of = pair_of
        self.invisible = pair_of is not None
        self.udn = rincon(room + (" (R)" if self.invisible else ""))
        self.label = f"{room}{' (R)' if self.invisible else ''} · "
        self.location = f"http://{args.bind}:{port}/xml/device_description.xml"
        self.renderer = Renderer(args, label=self.label)
        self.online = True

    def describe(self, args):
        root = [
            (DP, "DeviceProperties", "/DeviceProperties/Control"),
            (ZGT, "ZoneGroupTopology", "/ZoneGroupTopology/Control"),
        ]
        server = [
            (CD, "ContentDirectory", "/MediaServer/ContentDirectory/Control"),
            (CM, "ConnectionManager", "/MediaServer/ConnectionManager/Control"),
        ]
        renderer = [
            (RC, "RenderingControl", "/MediaRenderer/RenderingControl/Control"),
            (CM, "ConnectionManager", "/MediaRenderer/ConnectionManager/Control"),
            (AVT, "AVTransport", "/MediaRenderer/AVTransport/Control"),
            (GRC, "GroupRenderingControl", "/MediaRenderer/GroupRenderingControl/Control"),
        ]
        # The shape of a real one: a ZonePlayer root that holds the room name, with the
        # renderer nested inside it, and a friendlyName nobody would want in a list.
        return (
            '<?xml version="1.0" encoding="utf-8" ?>'
            '<root xmlns="urn:schemas-upnp-org:device-1-0">'
            "<specVersion><major>1</major><minor>0</minor></specVersion>"
            "<device>"
            f"<deviceType>{ZONE_PLAYER}</deviceType>"
            f"<friendlyName>{args.bind} - {SONOS_MODEL} - {self.udn}</friendlyName>"
            "<manufacturer>Sonos, Inc.</manufacturer>"
            "<manufacturerURL>http://www.sonos.com</manufacturerURL>"
            "<modelNumber>S18</modelNumber>"
            "<modelDescription>Sonos One</modelDescription>"
            f"<modelName>{SONOS_MODEL}</modelName>"
            f"<UDN>uuid:{self.udn}</UDN>"
            f"<roomName>{xml_escape(self.room)}</roomName>"
            "<displayName>One</displayName>"
            f"<serviceList>{service_list(root)}</serviceList>"
            "<deviceList>"
            "<device><deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>"
            f"<friendlyName>{args.bind} - {SONOS_MODEL} Media Server</friendlyName>"
            "<manufacturer>Sonos, Inc.</manufacturer>"
            f"<modelName>{SONOS_MODEL}</modelName>"
            f"<UDN>uuid:{self.udn}_MS</UDN>"
            f"<serviceList>{service_list(server)}</serviceList></device>"
            "<device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>"
            f"<friendlyName>{xml_escape(self.room)} - {SONOS_MODEL}</friendlyName>"
            "<manufacturer>Sonos, Inc.</manufacturer>"
            f"<modelName>{SONOS_MODEL}</modelName>"
            f"<UDN>uuid:{self.udn}_MR</UDN>"
            f"<serviceList>{service_list(renderer)}</serviceList></device>"
            "</deviceList>"
            "</device></root>"
        )


class Household:
    """Every speaker, and which group each is in. One lock for all of it."""

    def __init__(self, players):
        self.lock = threading.RLock()
        self.players = {p.udn: p for p in players}
        self.groups = {p.udn: self.companions(p.udn) for p in players if not p.invisible}
        self.group_ids = {}
        self.snapshots = {}
        self._next_group = 1
        for coordinator in self.groups:
            self._new_group_id(coordinator)

    def _new_group_id(self, coordinator):
        self.group_ids[coordinator] = f"{coordinator}:{self._next_group}"
        self._next_group += 1
        return self.group_ids[coordinator]

    def by_room(self, room):
        return next(
            (p for p in self.players.values() if not p.invisible and p.room.lower() == room.lower()),
            None,
        )

    def companions(self, udn):
        """A speaker and the invisible half that moves with it."""
        return [udn] + [p.udn for p in self.players.values() if p.pair_of is self.players[udn]]

    def coordinator_of(self, udn):
        for coordinator, members in self.groups.items():
            if udn in members:
                return coordinator
        return None

    def visible(self, members):
        return [u for u in members if not self.players[u].invisible]

    def _hand_over(self, source, target):
        """The group carries on from where it was, on its new coordinator."""
        a, b = self.players[source].renderer, self.players[target].renderer
        with a.lock, b.lock:
            b.uri, b.metadata, b.duration, b.status = a.uri, a.metadata, a.duration, a.status
            b._set(a.state, a.position())

    def _silence(self, udn):
        """A speaker that leaves a group goes quiet, back on its own empty queue."""
        r = self.players[udn].renderer
        with r.lock:
            r._pending = None
            r.uri, r.metadata, r.duration = f"x-rincon-queue:{udn}#0", "", 0
            r._set("STOPPED", 0)

    def _detach(self, udn):
        """Takes a speaker out of its group. Returns who coordinates what it left."""
        coordinator = self.coordinator_of(udn)
        moving = self.companions(udn)
        rest = [u for u in self.groups.pop(coordinator) if u not in moving]
        self.snapshots.pop(coordinator, None)
        heir = None
        if coordinator != udn:
            self.groups[coordinator] = rest
            heir = coordinator
        elif self.visible(rest):
            # Assumed, not observed: coordination passes to the next speaker and the
            # music carries on there, which is what the Sonos app shows.
            heir = self.visible(rest)[0]
            self.groups[heir] = [heir] + [u for u in rest if u != heir]
            self._hand_over(udn, heir)
            self._new_group_id(heir)
            log("SONOS", f"{self.players[heir].room} now coordinates what {self.players[udn].room} left")
        if coordinator == udn:
            self.group_ids.pop(coordinator, None)
        self._silence(udn)
        return heir

    def join(self, udn, target):
        with self.lock:
            target = self.coordinator_of(target)
            if target is None or target == self.coordinator_of(udn):
                return
            self._detach(udn)
            self.groups[target].extend(self.companions(udn))
            log("SONOS", f"\033[1m{self.players[udn].room}\033[0m joined {self.players[target].room}'s group")
            self.print_table()

    def leave(self, udn):
        """BecomeCoordinatorOfStandaloneGroup: (who took over what it left, its new group id)."""
        with self.lock:
            if self.groups.get(udn) == self.companions(udn):
                return None, self.group_ids[udn]
            heir = self._detach(udn)
            self.groups[udn] = self.companions(udn)
            group_id = self._new_group_id(udn)
            log("SONOS", f"\033[1m{self.players[udn].room}\033[0m left its group")
            self.print_table()
            return heir, group_id

    def go_offline(self, udn):
        with self.lock:
            player = self.players[udn]
            if not player.online:
                return
            members = self.groups.get(self.coordinator_of(udn), [])
            if self.coordinator_of(udn) == udn:
                # A coordinator pulled off the network takes the group's stream with
                # it: everyone left is on their own, and silent.
                for other in self.visible(members):
                    if other != udn:
                        self.groups[other] = self.companions(other)
                        self._new_group_id(other)
                        self._silence(other)
                self.groups.pop(udn)
            else:
                self._detach(udn)
            self._silence(udn)
            for twin in self.companions(udn):
                self.players[twin].online = False
            log("SONOS", f"\033[33m{player.room} dropped off the network\033[0m")
            self.print_table()

    def revive(self, udn):
        with self.lock:
            if self.players[udn].online:
                return
            for twin in self.companions(udn):
                self.players[twin].online = True
            self._silence(udn)
            self.groups[udn] = self.companions(udn)
            self._new_group_id(udn)
            log("SONOS", f"{self.players[udn].room} is back, on its own")
            self.print_table()

    def set_volume(self, udn, volume):
        with self.lock:
            for u in self.companions(udn):
                self.players[u].renderer.volume = max(0, min(100, volume))

    def group_volume(self, coordinator):
        members = self.visible(self.groups[coordinator])
        return round(sum(self.players[u].renderer.volume for u in members) / len(members))

    def snapshot(self, coordinator):
        with self.lock:
            self.snapshots[coordinator] = {
                u: self.players[u].renderer.volume for u in self.visible(self.groups[coordinator])
            }

    def set_group_volume(self, coordinator, volume):
        """Scales every speaker from the last snapshot, keeping their ratios."""
        with self.lock:
            members = self.visible(self.groups[coordinator])
            snap = self.snapshots.get(coordinator)
            if snap is None:
                log("SONOS", "\033[33mSetGroupVolume with no snapshot: scaling from the current volumes\033[0m")
                snap = {u: self.players[u].renderer.volume for u in members}
            before = sum(snap.get(u, 0) for u in members) / len(members)
            for u in members:
                self.set_volume(u, volume if before == 0 else round(snap.get(u, 0) * volume / before))
            self.print_table()

    def zone_group_state(self):
        groups, vanished = [], []
        for coordinator, members in self.groups.items():
            rendered = []
            for u in members:
                p = self.players[u]
                attributes = (
                    f'UUID="{u}" Location="{p.location}" ZoneName="{xml_escape(p.room)}" '
                    'Icon="x-rincon-roomicon:living" Configuration="1" SoftwareVersion="79.1-56030" '
                    'SWGen="2" MinCompatibleVersion="78.0-00000" BootSeq="42"'
                )
                pair = [x for x in self.companions(u if not p.invisible else p.pair_of.udn)]
                if len(pair) > 1:
                    attributes += f' ChannelMapSet="{pair[0]}:LF,LF;{pair[1]}:RF,RF"'
                if p.invisible:
                    attributes += ' Invisible="1"'
                rendered.append(f"<ZoneGroupMember {attributes}/>")
            groups.append(
                f'<ZoneGroup Coordinator="{coordinator}" ID="{self.group_ids[coordinator]}">'
                + "".join(rendered)
                + "</ZoneGroup>"
            )
        for p in self.players.values():
            if not p.online and not p.invisible:
                vanished.append(f'<Device UUID="{p.udn}" ZoneName="{xml_escape(p.room)}" Reason="powered off"/>')
        state = (
            "<ZoneGroupState><ZoneGroups>" + "".join(groups) + "</ZoneGroups>"
            "<VanishedDevices>" + "".join(vanished) + "</VanishedDevices></ZoneGroupState>"
        )
        return xml_escape(state)

    def print_table(self):
        with self.lock:
            lines = []
            for coordinator, members in self.groups.items():
                r = self.players[coordinator].renderer
                track = re.search(r"[?&]id=([^&]+)", r.uri)
                track = track.group(1) if track else ("its own empty queue" if r.uri.startswith("x-rincon-queue:") else r.uri or "-")
                lines.append(
                    f"  \033[1m{self.players[coordinator].room}\033[0m  {r.state} "
                    f"{hms(r.position())}/{hms(r.duration)}  {track}"
                    + (f"  group vol {self.group_volume(coordinator)}" if len(self.visible(members)) > 1 else "")
                )
                for u in members:
                    p = self.players[u]
                    role = "coordinator" if u == coordinator else ("hidden pair half" if p.invisible else "member")
                    lines.append(f"      {p.label[:-3]:<20} vol {p.renderer.volume:>3}  {role}")
            for p in self.players.values():
                if not p.online and not p.invisible:
                    lines.append(f"  \033[33m{p.room}: off the network\033[0m")
        print("\n".join(lines), flush=True)


class SonosServer(Server):
    """One speaker's HTTP endpoint. Grouping is answered here; a coordinator's own
    transport falls through to the plain renderer, quirk flags and all."""

    def __init__(self, args, household, player):
        super().__init__(("", player.port), args, player.renderer, player.describe(args), player.udn)
        self.household = household
        self.player = player
        self.label = player.label

    def offline(self):
        return not self.player.online

    def dispatch(self, action, body):
        h, me = self.household, self.player.udn
        with h.lock:
            coordinator = h.coordinator_of(me)
        member = coordinator != me

        if action == "SetAVTransportURI":
            uri = xml_unescape(tag(body, "CurrentURI"))
            if uri.startswith("x-rincon:"):
                target = uri.split(":", 1)[1]
                if target == me or target not in h.players:
                    return 500, fault(701, "Transition not available")
                h.join(me, target)
                return 200, envelope(AVT, action, "")
            if member:
                # Assumed from the existing redirect's comments, not observed: a member
                # refuses a track rather than leaving its group to play it.
                describe_handoff(uri, tag(body, "CurrentURIMetaData"))
                log(self.label + "REFUSE", "\033[33mnot the group's coordinator\033[0m")
                return 500, fault(701, "Transition not available")

        if action == "BecomeCoordinatorOfStandaloneGroup":
            heir, group_id = h.leave(me)
            return 200, envelope(
                AVT,
                action,
                f"<DelegatedGroupCoordinatorID>{heir or ''}</DelegatedGroupCoordinatorID>"
                f"<NewGroupID>{group_id}</NewGroupID>",
            )

        if member and action in ("Play", "Pause", "Stop", "Seek", "Next", "Previous", "SetNextAVTransportURI"):
            log(self.label + "REFUSE", f"\033[33m{action} sent to a member\033[0m")
            return 500, fault(701, "Transition not available")

        if member and action == "GetTransportInfo":
            # A member always says PLAYING, whatever its group is doing.
            return 200, envelope(
                AVT,
                action,
                "<CurrentTransportState>PLAYING</CurrentTransportState>"
                "<CurrentTransportStatus>OK</CurrentTransportStatus><CurrentSpeed>1</CurrentSpeed>",
            )
        if member and action == "GetPositionInfo":
            return 200, envelope(
                AVT,
                action,
                "<Track>1</Track><TrackDuration>0:00:00</TrackDuration><TrackMetaData></TrackMetaData>"
                f"<TrackURI>x-rincon:{coordinator}</TrackURI>"
                "<RelTime>NOT_IMPLEMENTED</RelTime><AbsTime>NOT_IMPLEMENTED</AbsTime>"
                "<RelCount>2147483647</RelCount><AbsCount>2147483647</AbsCount>",
            )

        if action == "SetVolume":
            h.set_volume(me, int(tag(body, "DesiredVolume") or 0))
            log(self.label + "VOLUME", f"-> {self.player.renderer.volume}")
            return 200, envelope(RC, action, "")

        if action in ("SnapshotGroupVolume", "GetGroupVolume", "SetGroupVolume", "SetRelativeGroupVolume"):
            if member:
                log(self.label + "REFUSE", f"\033[33m{action} sent to a member\033[0m")
                return 500, fault(701, "Player isn't the coordinator")
            if action == "SnapshotGroupVolume":
                h.snapshot(me)
                return 200, envelope(GRC, action, "")
            if action == "GetGroupVolume":
                return 200, envelope(GRC, action, f"<CurrentVolume>{h.group_volume(me)}</CurrentVolume>")
            if action == "SetGroupVolume":
                h.set_group_volume(me, int(tag(body, "DesiredVolume") or 0))
                return 200, envelope(GRC, action, "")
            h.set_group_volume(me, h.group_volume(me) + int(tag(body, "Adjustment") or 0))
            return 200, envelope(GRC, action, f"<NewVolume>{h.group_volume(me)}</NewVolume>")

        if action == "GetZoneGroupState":
            return 200, envelope(ZGT, action, f"<ZoneGroupState>{h.zone_group_state()}</ZoneGroupState>")
        if action == "GetZoneGroupAttributes":
            with h.lock:
                members = h.groups[coordinator]
                return 200, envelope(
                    ZGT,
                    action,
                    f"<CurrentZoneGroupName>{xml_escape(h.players[coordinator].room)}</CurrentZoneGroupName>"
                    f"<CurrentZoneGroupID>{h.group_ids[coordinator]}</CurrentZoneGroupID>"
                    f"<CurrentZonePlayerUUIDsInGroup>{','.join(members)}</CurrentZonePlayerUUIDsInGroup>",
                )
        if action == "GetZoneAttributes":
            return 200, envelope(
                DP,
                action,
                f"<CurrentZoneName>{xml_escape(self.player.room)}</CurrentZoneName>"
                "<CurrentIcon>x-rincon-roomicon:living</CurrentIcon>"
                "<CurrentConfiguration>1</CurrentConfiguration>"
                f"<CurrentTargetRoomName>{xml_escape(self.player.room)}</CurrentTargetRoomName>",
            )

        return super().dispatch(action, body)


CONSOLE_HELP = """commands (they stand in for someone using the Sonos app):
  group MEMBER COORDINATOR   MEMBER joins COORDINATOR's group
  ungroup ROOM               ROOM leaves its group
  vol ROOM N                 set ROOM's own volume
  pause ROOM / play ROOM     press pause/play on ROOM's group
  mute-net ROOM              ROOM stops answering anything
  revive ROOM                ROOM is back, on its own
  status                     print the household"""


def household_console(household, stop):
    while not stop.is_set():
        line = sys.stdin.readline()
        if not line:
            return
        try:
            words = shlex.split(line)
        except ValueError as e:
            print(e)
            continue
        if not words:
            continue
        command, rooms = words[0].lower(), words[1:]
        players = [household.by_room(r) for r in rooms]
        if command in ("status", "s"):
            household.print_table()
            continue
        if command not in ("group", "ungroup", "vol", "pause", "play", "mute-net", "revive") or not players:
            print(CONSOLE_HELP, flush=True)
            continue
        if players[0] is None:
            print(f"no room called {rooms[0]!r}", flush=True)
            continue
        udn = players[0].udn
        if command == "group":
            if len(players) < 2 or players[1] is None:
                print("group MEMBER COORDINATOR", flush=True)
                continue
            household.join(udn, players[1].udn)
        elif command == "ungroup":
            household.leave(udn)
        elif command == "vol":
            household.set_volume(udn, int(rooms[1]) if len(rooms) > 1 and rooms[1].isdigit() else 30)
            household.print_table()
        elif command in ("pause", "play"):
            r = household.players[household.coordinator_of(udn)].renderer
            r.pause() if command == "pause" else r.play()
        elif command == "mute-net":
            household.go_offline(udn)
        elif command == "revive":
            household.revive(udn)


def run_household(args, stop):
    rooms = [r.strip() for r in args.sonos_rooms.split(",") if r.strip()]
    port = args.port or 1400
    players = []
    for room in rooms:
        player = Player(args, room, port)
        players.append(player)
        port += 1
        if room.lower() in (r.lower() for r in args.stereo_pair):
            players.append(Player(args, room, port, pair_of=player))
            port += 1
    household = Household(players)
    for spec in args.group:
        member, _, coordinator = (part.strip() for part in spec.partition(">"))
        a, b = household.by_room(member), household.by_room(coordinator)
        if a is None or b is None:
            raise SystemExit(f"--group {spec!r}: no such room")
        household.join(a.udn, b.udn)

    for player in players:
        server = SonosServer(args, household, player)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        log("READY", f"\033[1m{player.label[:-3]}\033[0m at {player.location}")
    targets = lambda: [(p.location, p.udn) for p in players if p.online]
    threading.Thread(target=ssdp_responder, args=(args, targets, stop), daemon=True).start()
    if args.notify_only:
        threading.Thread(target=ssdp_announcer, args=(args, targets, stop), daemon=True).start()
    threading.Thread(target=household_console, args=(household, stop), daemon=True).start()
    print(CONSOLE_HELP, flush=True)
    household.print_table()
    return household


def main():
    p = argparse.ArgumentParser(
        description="A fake UPnP/DLNA renderer for developing Wavio casting.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--name", default="Wavio Mock Renderer", help="friendlyName shown in the app")
    p.add_argument("--port", type=int, default=None,
                   help="HTTP port (default 8060; a household numbers its speakers up from 1400)")
    p.add_argument("--bind", default=None, help="LAN address to advertise (default: auto)")
    p.add_argument("--udn", default=None, help="fixed UDN, so a restart looks like the same device (default: random)")
    p.add_argument("--duration", type=float, default=0, help="override track length, seconds")
    p.add_argument("-v", "--verbose", action="store_true", help="print every SOAP envelope")

    s = p.add_argument_group("a Sonos household (replaces a single renderer)")
    s.add_argument("--sonos-rooms", metavar="ROOMS",
                   help='comma-separated rooms, one speaker each, e.g. "Living Room,Kitchen,Bedroom"')
    s.add_argument("--stereo-pair", metavar="ROOM", action="append", default=[],
                   help="give ROOM an invisible right half that still answers discovery (repeatable)")
    s.add_argument("--group", metavar="MEMBER>COORDINATOR", action="append", default=[],
                   help='start with MEMBER already in COORDINATOR\'s group, e.g. "Kitchen>Living Room" (repeatable)')
    s.add_argument("--dashboard", type=float, default=0, metavar="SEC",
                   help="print the household every SEC seconds while a group plays")

    q = p.add_argument_group("quirks (each reproduces a real renderer's misbehaviour; a household's speakers all share them)")
    q.add_argument("--autoplay", action="store_true", help="start on SetAVTransportURI, without waiting for Play")
    q.add_argument("--reject-didl", action="store_true", help="refuse any SetAVTransportURI carrying metadata")
    q.add_argument("--reject-mime", metavar="MIME", help="refuse this MIME, e.g. audio/flac")
    q.add_argument("--stop-early", type=float, default=0, metavar="SEC", help="report STOPPED this early")
    q.add_argument("--stop-at", type=float, default=0, metavar="SEC",
                   help="once per track, stop from the renderer's own remote at this position (Kodi)")
    q.add_argument("--no-track-uri", action="store_true", help="never report TrackURI in GetPositionInfo")
    q.add_argument("--flaky-discovery", action="store_true", help="answer only every other M-SEARCH")
    q.add_argument("--duplicate-names", action="store_true", help="send two SSDP replies per search")
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
    stop = threading.Event()

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

    if args.sonos_rooms:
        household = run_household(args, stop)
        renderers = lambda: [
            household.players[c].renderer for c in list(household.groups) if household.players[c].online
        ]
    else:
        port = args.port or 8060
        udn = args.udn or str(uuid.uuid4())
        base = f"http://{args.bind}:{port}"
        location = f"{base}/description.xml"
        renderer = Renderer(args)
        server = Server(("", port), args, renderer, description_xml(args.name, udn, base), udn)
        targets = lambda: [(location, udn)]
        threading.Thread(target=ssdp_responder, args=(args, targets, stop), daemon=True).start()
        if args.notify_only:
            threading.Thread(target=ssdp_announcer, args=(args, targets, stop), daemon=True).start()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        renderers = lambda: [renderer]
        log("READY", f"\033[1m{args.name}\033[0m at {location}")
    log("READY", f"quirks: {', '.join(quirks) if quirks else 'none (a well-behaved renderer)'}")

    last_dashboard = time.monotonic()
    try:
        while True:
            for r in renderers():
                r.tick()
            if (
                args.sonos_rooms
                and args.dashboard
                and time.monotonic() - last_dashboard >= args.dashboard
                and any(r.state == "PLAYING" for r in renderers())
            ):
                last_dashboard = time.monotonic()
                household.print_table()
            time.sleep(0.25)
    except KeyboardInterrupt:
        log("BYE", "shutting down")
        stop.set()


if __name__ == "__main__":
    main()
