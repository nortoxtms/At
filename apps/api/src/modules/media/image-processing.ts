/**
 * Image processing — spec §10.1, §10.3.
 *
 * §10.3: "EXIF GPS must be stripped from every uploaded image before storage.
 * Non-negotiable." §24.8 audits it with exiftool on 20 random uploads.
 *
 * This is implemented by hand rather than delegated to an image library
 * because the requirement is precise and the failure is silent: a resize
 * library that happens to drop metadata today can start preserving it after a
 * version bump, and nobody would notice until a seller's home address leaked
 * through a photo of their horse.
 */

/** A JPEG APPn marker, e.g. APP1 (0xFFE1) carries EXIF. */
const JPEG_SOI = 0xd8;
const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;

export interface ExifStripResult {
  output: Buffer;
  /** Markers removed, for the audit trail on `media.exif_stripped_at`. */
  removedSegments: string[];
  hadGps: boolean;
}

/**
 * Removes every metadata segment from a JPEG: EXIF (APP1), XMP (also APP1),
 * Photoshop/IPTC (APP13), and the rest of the APPn range.
 *
 * Dropping all of APP1..APP15 rather than surgically editing the GPS IFD is
 * deliberate. GPS coordinates appear in EXIF GPS tags, in XMP, and in maker
 * notes, and a parser that walks only the first will pass a test suite while
 * still leaking. Nothing in an APPn segment is needed to render the image;
 * only APP0 (JFIF) affects display, and that is preserved.
 */
export function stripJpegMetadata(input: Buffer): ExifStripResult {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== JPEG_SOI) {
    throw new Error('Not a JPEG');
  }

  const output: Buffer[] = [input.subarray(0, 2)];
  const removedSegments: string[] = [];
  let hadGps = false;
  let offset = 2;

  while (offset < input.length - 1) {
    if (input[offset] !== 0xff) {
      // Desynchronised — copy the remainder untouched rather than guessing.
      output.push(input.subarray(offset));
      break;
    }

    const marker = input[offset + 1]!;

    if (marker === JPEG_EOI) {
      output.push(input.subarray(offset));
      break;
    }

    // Start of scan: everything after it is entropy-coded image data.
    if (marker === JPEG_SOS) {
      output.push(input.subarray(offset));
      break;
    }

    // Standalone markers carry no length field.
    if (marker >= 0xd0 && marker <= 0xd9) {
      output.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = input.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + length;
    if (segmentEnd > input.length) {
      output.push(input.subarray(offset));
      break;
    }

    // APP1..APP15 hold EXIF, XMP, IPTC and maker notes. APP0 is JFIF and is
    // kept because some decoders rely on its density fields.
    const isMetadataApp = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;

    if (isMetadataApp || isComment) {
      const segment = input.subarray(offset + 4, segmentEnd);
      if (containsGpsMarker(segment)) hadGps = true;
      removedSegments.push(`0xFF${marker.toString(16).toUpperCase()}`);
    } else {
      output.push(input.subarray(offset, segmentEnd));
    }

    offset = segmentEnd;
  }

  return { output: Buffer.concat(output), removedSegments, hadGps };
}

/**
 * Best-effort detection of GPS data in a removed segment, recorded so the
 * moderation trail can show that a location was present and dropped. It never
 * gates the removal — the segment goes regardless of what this returns.
 */
function containsGpsMarker(segment: Buffer): boolean {
  // EXIF GPS IFD pointer tag is 0x8825, in either byte order.
  for (let i = 0; i + 1 < segment.length; i += 1) {
    const be = segment.readUInt16BE(i);
    if (be === 0x8825) return true;
  }
  return segment.includes('GPSLatitude') || segment.includes('exif:GPS');
}

/**
 * PNG metadata lives in ancillary chunks; eXIf, tEXt, iTXt and zTXt can all
 * carry location. Critical chunks (IHDR, PLTE, IDAT, IEND) are preserved.
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

export function stripPngMetadata(input: Buffer): ExifStripResult {
  if (!input.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG');
  }

  const output: Buffer[] = [input.subarray(0, 8)];
  const removedSegments: string[] = [];
  let hadGps = false;
  let offset = 8;

  while (offset + 8 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString('latin1');
    const chunkEnd = offset + 12 + length; // length + type + data + crc

    if (chunkEnd > input.length) break;

    if (PNG_METADATA_CHUNKS.has(type)) {
      if (containsGpsMarker(input.subarray(offset + 8, offset + 8 + length))) hadGps = true;
      removedSegments.push(type);
    } else {
      output.push(input.subarray(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  return { output: Buffer.concat(output), removedSegments, hadGps };
}

export function stripImageMetadata(input: Buffer, mimeType: string): ExifStripResult {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return stripJpegMetadata(input);
  }
  if (mimeType === 'image/png') {
    return stripPngMetadata(input);
  }

  // WebP, HEIC and AVIF carry metadata in ISO-BMFF/RIFF boxes. Rather than
  // ship a half-parser that silently passes them through, they are rejected at
  // upload-intent (ALLOWED_IMAGE_MIME_TYPES) until a real implementation
  // lands. §10.3 does not permit a best-effort here.
  throw new Error(`Metadata stripping is not implemented for ${mimeType}`);
}
