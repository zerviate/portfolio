// Lossless removal: image pixels, color profiles and dimensions are untouched.
export function strip_image_metadata(bytes, extension) {
  if (extension === ".png") {
    const chunks = [bytes.subarray(0, 8)];
    for (let offset = 8; offset < bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + length + 12;
      if (end > bytes.length) throw new Error("Invalid PNG chunk");
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (!["eXIf", "iTXt", "tEXt", "zTXt"].includes(type)) chunks.push(bytes.subarray(offset, end));
      offset = end;
    }
    return Buffer.concat(chunks);
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    const segments = [bytes.subarray(0, 2)];
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG segment");
      const marker = bytes[offset + 1];
      if ([0xda, 0xd9].includes(marker)) {
        segments.push(bytes.subarray(offset));
        break;
      }
      const end = offset + 2 + bytes.readUInt16BE(offset + 2);
      if (end > bytes.length) throw new Error("Invalid JPEG segment length");
      if (![0xe1, 0xed, 0xfe].includes(marker)) segments.push(bytes.subarray(offset, end));
      else if (marker === 0xe1 && bytes.toString("ascii", offset + 4, offset + 10) === "Exif\0\0") {
        const tiff = bytes.subarray(offset + 10, end);
        const little = tiff.toString("ascii", 0, 2) === "II";
        const u16 = index => little ? tiff.readUInt16LE(index) : tiff.readUInt16BE(index);
        const u32 = index => little ? tiff.readUInt32LE(index) : tiff.readUInt32BE(index);
        const directory = u32(4);
        for (let i = 0; i < u16(directory); i++) {
          const entry = directory + 2 + 12 * i;
          if (u16(entry) === 0x0112 && u16(entry + 8) !== 1) {
            throw new Error("Review oriented JPEG before removing EXIF");
          }
        }
      }
      offset = end;
    }
    return Buffer.concat(segments);
  }
  if (extension === ".webp") {
    const chunks = [Buffer.from(bytes.subarray(0, 12))];
    for (let offset = 12; offset < bytes.length;) {
      const type = bytes.toString("ascii", offset, offset + 4);
      const length = bytes.readUInt32LE(offset + 4);
      const end = offset + 8 + length + (length % 2);
      if (end > bytes.length) throw new Error("Invalid WebP chunk");
      if (!["EXIF", "XMP "].includes(type)) {
        const chunk = Buffer.from(bytes.subarray(offset, end));
        if (type === "VP8X") chunk[8] &= ~0x0c;
        chunks.push(chunk);
      }
      offset = end;
    }
    const result = Buffer.concat(chunks);
    result.writeUInt32LE(result.length - 8, 4);
    return result;
  }
  return bytes;
}
