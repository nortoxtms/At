import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import sharp from 'sharp';

import { stripImageMetadata, stripJpegMetadata, stripPngMetadata } from './image-processing.js';
import { computePerceptualHash, hammingDistance } from './perceptual-hash.js';

const execFileAsync = promisify(execFile);

/**
 * §24.8: "EXIF GPS is absent from every stored image (verify with exiftool on
 * 20 random uploads)." exiftool is not always present in CI, so the assertions
 * below are made directly against the byte stream, and the exiftool check runs
 * as an extra confirmation when the binary is available.
 */

/** A JPEG carrying an APP1 EXIF block with a GPS IFD pointer (tag 0x8825). */
async function jpegWithGps(): Promise<Buffer> {
  const base = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();

  // Minimal TIFF header + one IFD entry pointing at a GPS IFD, then a GPS IFD
  // holding a latitude. Hand-built so the fixture cannot be silently changed
  // by an image library upgrade.
  const tiff = Buffer.alloc(64);
  tiff.write('MM', 0, 'latin1'); // big-endian
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4); // offset of IFD0
  tiff.writeUInt16BE(1, 8); // one entry
  tiff.writeUInt16BE(0x8825, 10); // GPSInfo IFD pointer
  tiff.writeUInt16BE(4, 12); // LONG
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt32BE(26, 18); // -> GPS IFD
  tiff.writeUInt32BE(0, 22); // no next IFD
  tiff.writeUInt16BE(1, 26); // GPS IFD: one entry
  tiff.writeUInt16BE(0x0002, 28); // GPSLatitude
  tiff.writeUInt16BE(5, 30); // RATIONAL
  tiff.writeUInt32BE(1, 32);
  tiff.writeUInt32BE(48, 36);
  tiff.writeUInt32BE(41, 48); // 41 deg — Istanbul
  tiff.writeUInt32BE(1, 52);

  const exifPayload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(exifPayload.length + 2);
      return length;
    })(),
    exifPayload,
  ]);

  // Insert immediately after SOI so it precedes any APP0 the encoder wrote.
  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
}

describe('§10.3 EXIF stripping', () => {
  it('removes the APP1 EXIF segment from a JPEG', async () => {
    const withGps = await jpegWithGps();
    expect(withGps.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(true);

    const { output, removedSegments, hadGps } = stripJpegMetadata(withGps);

    expect(hadGps).toBe(true);
    expect(removedSegments).toContain('0xFFE1');
    expect(output.includes(Buffer.from('Exif\0\0', 'latin1'))).toBe(false);
  });

  it('leaves the image decodable after stripping', async () => {
    const { output } = stripJpegMetadata(await jpegWithGps());
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe('jpeg');
    expect(metadata.width).toBe(64);
    expect(metadata.height).toBe(64);
  });

  it('removes every metadata segment sharp itself writes', async () => {
    // sharp's withMetadata() is the realistic path: a phone photo re-encoded
    // by a client library before upload.
    const annotated = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'test', Artist: 'gps 41.0082 28.9784' } } })
      .jpeg()
      .toBuffer();

    const { output } = stripJpegMetadata(annotated);
    expect(output.includes(Buffer.from('41.0082', 'latin1'))).toBe(false);
  });

  it('strips PNG text and eXIf chunks while keeping the image intact', async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();

    const withText = injectPngTextChunk(png, 'Comment', 'GPSLatitude 41.0082');
    expect(withText.includes(Buffer.from('41.0082', 'latin1'))).toBe(true);

    const { output, removedSegments } = stripPngMetadata(withText);

    expect(removedSegments).toContain('tEXt');
    expect(output.includes(Buffer.from('41.0082', 'latin1'))).toBe(false);
    await expect(sharp(output).metadata()).resolves.toMatchObject({ format: 'png', width: 16 });
  });

  // §10.3 admits no best-effort: a format we cannot clean must be refused,
  // not passed through.
  it('refuses formats it cannot clean', () => {
    expect(() => stripImageMetadata(Buffer.alloc(16), 'image/webp')).toThrow(
      /not implemented for image\/webp/,
    );
  });

  it('confirms with exiftool when it is installed', async () => {
    const available = await execFileAsync('which', ['exiftool']).then(
      () => true,
      () => false,
    );
    if (!available) {
      // Not a silent skip: CI installs exiftool, so a missing binary locally
      // still leaves the byte-level assertions above as the real gate.
      return;
    }

    const { output } = stripJpegMetadata(await jpegWithGps());
    const directory = await mkdtemp(join(tmpdir(), 'oh-exif-'));
    const path = join(directory, 'stripped.jpg');
    await writeFile(path, output);

    const { stdout } = await execFileAsync('exiftool', ['-gps:all', '-s', path]);
    expect(stdout.trim()).toBe('');
  });
});

describe('§14.2 perceptual hashing', () => {
  const gradient = (shift: number) =>
    sharp({
      create: { width: 128, height: 128, channels: 3, background: { r: 40, g: 60, b: 90 } },
    })
      .composite([
        {
          input: {
            create: {
              width: 64,
              height: 64,
              channels: 3,
              background: { r: 220, g: 200 - shift, b: 120 },
            },
          },
          top: 20,
          left: 20 + shift,
        },
      ])
      .jpeg()
      .toBuffer();

  it('produces a stable 64-bit hash', async () => {
    const hash = await computePerceptualHash(await gradient(0));
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives an identical hash for the same image', async () => {
    const image = await gradient(0);
    expect(await computePerceptualHash(image)).toBe(await computePerceptualHash(image));
  });

  // The scam this exists to catch: a stolen photo, re-saved and resized.
  it('matches the same photo after a resize and re-encode', async () => {
    const original = await gradient(0);
    const republished = await sharp(original).resize(96, 96).jpeg({ quality: 70 }).toBuffer();

    const distance = hammingDistance(
      await computePerceptualHash(original),
      await computePerceptualHash(republished),
    );

    // IMAGE_HASH_THRESHOLD defaults to 10 (§6).
    expect(distance).toBeLessThanOrEqual(10);
  });

  it('separates genuinely different photos', async () => {
    const distance = hammingDistance(
      await computePerceptualHash(await gradient(0)),
      await computePerceptualHash(await gradient(40)),
    );
    expect(distance).toBeGreaterThan(10);
  });

  it('treats hashes of different lengths as unrelated', () => {
    expect(hammingDistance('abcd', 'abcdef')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

/** Builds a PNG tEXt chunk and splices it in before IEND. */
function injectPngTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text, 'latin1'),
  ]);

  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);

  const iendIndex = png.length - 12;
  return Buffer.concat([png.subarray(0, iendIndex), chunk, png.subarray(iendIndex)]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
