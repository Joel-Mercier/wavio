#!/usr/bin/env python3
"""Generate a large synthetic MP3 library for load-testing Wavio against Navidrome.

Each track is a ~1 s silent MP3 (a few KB) with an ID3v2.3 tag written by hand,
so the only dependency is ffmpeg (used once, to produce the silent audio blob).
Navidrome scans and serves them exactly like real files; they even play.

    python3 tmp/gen-big-library.py --out ~/www/navidrome/music-big \
        --tracks 100000 --albums 10000 --artists 20000

Deterministic for a given --seed, so re-running produces the same library.
"""

import argparse
import os
import random
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

WORDS = (
    "Neon Velvet Echo Midnight Solar Glass Iron Silk Paper Ocean Crystal Ember "
    "Static Golden Hollow Silver Wild Electric Cosmic Violet Broken Quiet Lunar "
    "Rapid Frozen Dusty Amber Sonic Vapor Pulse Drift Signal Mirror Orbit Tide "
    "Nova Ghost Prism Ash Coral Rust Jade Slate Fever Motion Gravity Bloom"
).split()
GENRES = [
    "House", "Techno", "Trance", "Drum & Bass", "Hip-Hop", "Pop", "Rock",
    "Disco", "Funk", "Soul", "Ambient", "Jazz", "Reggae", "Latin", "Dubstep",
    "Garage", "Breakbeat", "Electro", "Downtempo", "Indie",
]
COMPILATION_SHARE = 0.3


def make_silent_mp3() -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "silence.mp3"
        subprocess.run(
            [
                "ffmpeg", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "1",
                "-c:a", "libmp3lame", "-b:a", "8k",
                "-id3v2_version", "0", "-write_xing", "0",
                str(path),
            ],
            check=True,
        )
        return path.read_bytes()


def synchsafe(n: int) -> bytes:
    return bytes(((n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F))


def text_frame(frame_id: str, value: str) -> bytes:
    payload = b"\x00" + value.encode("latin-1", "replace")
    return frame_id.encode("ascii") + struct.pack(">I", len(payload)) + b"\x00\x00" + payload


def id3v2(tags: dict[str, str]) -> bytes:
    body = b"".join(text_frame(k, v) for k, v in tags.items())
    return b"ID3\x03\x00\x00" + synchsafe(len(body)) + body


def name(rng: random.Random, words: int) -> str:
    return " ".join(rng.choice(WORDS) for _ in range(words))


def safe(s: str) -> str:
    return "".join(c if c.isalnum() or c in " -_&" else "_" for c in s).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--tracks", type=int, default=100_000)
    ap.add_argument("--albums", type=int, default=10_000)
    ap.add_argument("--artists", type=int, default=20_000)
    ap.add_argument("--seed", type=int, default=205)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    audio = make_silent_mp3()
    print(f"silent mp3 blob: {len(audio)} bytes", file=sys.stderr)

    # Distinct names: a numeric suffix keeps them unique once the word pool is
    # exhausted, which also gives search something to disambiguate.
    artists = [f"{name(rng, rng.choice((1, 2, 2, 3)))} {i}" for i in range(args.artists)]
    albums = []
    for i in range(args.albums):
        compilation = rng.random() < COMPILATION_SHARE
        albums.append({
            "title": f"{name(rng, rng.choice((1, 2, 3)))} {i}",
            "artist": "Various Artists" if compilation else rng.choice(artists),
            "compilation": compilation,
            "year": rng.randint(1975, 2026),
            "genre": rng.choice(GENRES),
        })

    # Spread tracks over albums with a skewed size distribution (many singles/EPs,
    # a long tail of big compilations), like a real DJ collection.
    sizes = [max(1, int(rng.expovariate(1 / (args.tracks / args.albums)))) for _ in albums]
    scale = args.tracks / sum(sizes)
    sizes = [max(1, round(s * scale)) for s in sizes]

    written = 0
    for album, count in zip(albums, sizes):
        album_dir = args.out / safe(album["artist"]) / safe(album["title"])
        album_dir.mkdir(parents=True, exist_ok=True)
        for n in range(1, count + 1):
            track_artist = rng.choice(artists) if album["compilation"] else album["artist"]
            title = f"{name(rng, rng.choice((1, 2, 3)))} {written}"
            tags = {
                "TIT2": title,
                "TPE1": track_artist,
                "TPE2": album["artist"],
                "TALB": album["title"],
                "TRCK": f"{n}/{count}",
                "TYER": str(album["year"]),
                "TCON": album["genre"],
            }
            if album["compilation"]:
                tags["TCMP"] = "1"
            path = album_dir / f"{n:02d} - {safe(title)}.mp3"
            with open(path, "wb") as f:
                f.write(id3v2(tags))
                f.write(audio)
            written += 1
            if written % 10_000 == 0:
                print(f"{written} tracks…", file=sys.stderr)

    print(
        f"done: {written} tracks, {len(albums)} albums, {len(artists)} artists in {args.out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
