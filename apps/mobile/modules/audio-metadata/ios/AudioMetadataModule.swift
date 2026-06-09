import AVFoundation
import CryptoKit
import ExpoModulesCore

public class AudioMetadataModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioMetadata")

    AsyncFunction("getAudioMetadata") {
      (uri: String, includeArtwork: Bool, artworkDir: String?) -> [String: Any] in
      return AudioMetadataModule.extract(
        uri: uri, includeArtwork: includeArtwork, artworkDir: artworkDir)
    }
  }

  private static func extract(
    uri: String, includeArtwork: Bool, artworkDir: String?
  ) -> [String: Any] {
    let url: URL
    if let parsed = URL(string: uri), parsed.scheme != nil {
      url = parsed
    } else {
      url = URL(fileURLWithPath: uri)
    }

    let asset = AVURLAsset(url: url)
    var result: [String: Any] = [:]

    let durationSeconds = CMTimeGetSeconds(asset.duration)
    if durationSeconds.isFinite && durationSeconds > 0 {
      result["durationMs"] = Int((durationSeconds * 1000.0).rounded())
    }

    if let track = asset.tracks(withMediaType: .audio).first {
      let rate = track.estimatedDataRate
      if rate.isFinite && rate > 0 {
        result["bitrate"] = Int(rate)
      }
    }

    var items = asset.commonMetadata
    for format in asset.availableMetadataFormats {
      items.append(contentsOf: asset.metadata(forFormat: format))
    }

    for item in items {
      guard let id = item.identifier else { continue }

      if id == .commonIdentifierTitle {
        setString(&result, "title", item)
      } else if id == .commonIdentifierArtist || id == .commonIdentifierAuthor {
        setStringIfAbsent(&result, "artist", item)
      } else if id == .commonIdentifierAlbumName {
        setString(&result, "album", item)
      } else if id == .commonIdentifierCreationDate {
        setYear(&result, item)
      } else if id == .commonIdentifierArtwork {
        if includeArtwork { setArtwork(&result, item, artworkDir) }
      } else if id == .id3MetadataBand || id == .iTunesMetadataAlbumArtist {
        setStringIfAbsent(&result, "albumArtist", item)
      } else if id == .id3MetadataComposer || id == .iTunesMetadataComposer {
        setStringIfAbsent(&result, "composer", item)
      } else if id == .id3MetadataContentType
        || id == .iTunesMetadataUserGenre
        || id == .iTunesMetadataPredefinedGenre {
        setStringIfAbsent(&result, "genre", item)
      } else if id == .id3MetadataTrackNumber || id == .iTunesMetadataTrackNumber {
        setNumberPair(&result, "trackNumber", "trackTotal", item)
      } else if id == .id3MetadataPartOfASet || id == .iTunesMetadataDiscNumber {
        setNumberPair(&result, "discNumber", "discTotal", item)
      } else if id == .id3MetadataYear
        || id == .id3MetadataRecordingTime
        || id == .iTunesMetadataReleaseDate {
        setYear(&result, item)
      } else if id == .id3MetadataAttachedPicture || id == .iTunesMetadataCoverArt {
        if includeArtwork { setArtwork(&result, item, artworkDir) }
      } else if id == .iTunesMetadataDiscCompilation {
        if let n = item.numberValue { result["isCompilation"] = n.boolValue }
      }
    }

    return result
  }
}

private func setString(_ result: inout [String: Any], _ key: String, _ item: AVMetadataItem) {
  if let value = item.stringValue, !value.isEmpty {
    result[key] = value
  }
}

private func setStringIfAbsent(
  _ result: inout [String: Any], _ key: String, _ item: AVMetadataItem
) {
  if result[key] == nil {
    setString(&result, key, item)
  }
}

private func setYear(_ result: inout [String: Any], _ item: AVMetadataItem) {
  if result["year"] != nil { return }

  var text: String?
  if let value = item.stringValue {
    text = value
  } else if let date = item.dateValue {
    text = ISO8601DateFormatter().string(from: date)
  }

  guard let candidate = text,
    let range = candidate.range(of: "\\d{4}", options: .regularExpression),
    let year = Int(candidate[range])
  else { return }

  result["year"] = year
}

private func setNumberPair(
  _ result: inout [String: Any],
  _ key: String,
  _ totalKey: String,
  _ item: AVMetadataItem
) {
  if result[key] != nil { return }

  // iTunes stores track/disc numbers as packed binary data, e.g.
  // 00 00 <number:2> <total:2> ...
  if let data = item.dataValue, data.count >= 6 {
    let bytes = [UInt8](data)
    let number = Int(bytes[2]) << 8 | Int(bytes[3])
    let total = Int(bytes[4]) << 8 | Int(bytes[5])
    if number > 0 { result[key] = number }
    if total > 0 { result[totalKey] = total }
    return
  }

  if let number = item.numberValue {
    result[key] = number.intValue
    return
  }

  // ID3 stores "n" or "n/total" as a string.
  if let value = item.stringValue {
    let parts = value.split(separator: "/")
    if let first = parts.first,
      let number = Int(first.trimmingCharacters(in: .whitespaces)) {
      result[key] = number
    }
    if parts.count > 1,
      let total = Int(parts[1].trimmingCharacters(in: .whitespaces)) {
      result[totalKey] = total
    }
  }
}

private func setArtwork(
  _ result: inout [String: Any], _ item: AVMetadataItem, _ artworkDir: String?
) {
  if result["artworkBase64"] != nil || result["artworkPath"] != nil { return }
  guard let data = item.dataValue else { return }

  // When a destination dir is given, persist the picture to a content-hashed
  // file (identical album art across tracks collapses to one file) and hand
  // back a path; otherwise inline it as base64.
  if let dir = artworkDir {
    if let written = writeArtwork(data: data, dirSpec: dir) {
      result["artworkPath"] = written.0
      result["artworkMimeType"] = written.1
    }
  } else {
    result["artworkBase64"] = data.base64EncodedString()
  }
}

/// Write picture bytes to `dirSpec`, named by a content hash so the same
/// artwork referenced by many tracks is stored once. Returns (file:// uri,
/// mime) or nil on failure.
private func writeArtwork(data: Data, dirSpec: String) -> (String, String)? {
  let dirURL: URL
  if let parsed = URL(string: dirSpec), parsed.scheme != nil {
    dirURL = parsed
  } else {
    dirURL = URL(fileURLWithPath: dirSpec)
  }
  do {
    try FileManager.default.createDirectory(
      at: dirURL, withIntermediateDirectories: true)
    let (ext, mime) = imageType(data)
    let fileURL = dirURL.appendingPathComponent("\(sha1Hex(data)).\(ext)")
    if !FileManager.default.fileExists(atPath: fileURL.path) {
      try data.write(to: fileURL)
    }
    return (fileURL.absoluteString, mime)
  } catch {
    return nil
  }
}

private func sha1Hex(_ data: Data) -> String {
  return Insecure.SHA1.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

/// Sniff a JPEG/PNG magic number, defaulting to JPEG.
private func imageType(_ data: Data) -> (String, String) {
  let bytes = [UInt8](data.prefix(8))
  if bytes.count >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF {
    return ("jpg", "image/jpeg")
  }
  if bytes.count >= 4 && bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E
    && bytes[3] == 0x47
  {
    return ("png", "image/png")
  }
  return ("jpg", "image/jpeg")
}
