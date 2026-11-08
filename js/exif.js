export async function readFocalLengthIn35mm(file) {
  try {
    if (!file || file.type !== 'image/jpeg') return null;
    const buf = await file.slice(0, 262144).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0) !== 0xffd8) return null;
    let pos = 2;
    while (pos + 4 < view.byteLength) {
      if (view.getUint8(pos) !== 0xff) return null;
      const marker = view.getUint8(pos + 1);
      if (marker === 0xda) return null;
      const size = view.getUint16(pos + 2);
      if (marker === 0xe1) {
        const start = pos + 4;
        if (
          view.getUint8(start) === 0x45 &&
          view.getUint8(start + 1) === 0x78 &&
          view.getUint8(start + 2) === 0x69 &&
          view.getUint8(start + 3) === 0x66
        ) {
          return parseExif(view, start + 6);
        }
      }
      pos += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

function parseExif(view, tiff) {
  const byteOrder = view.getUint16(tiff);
  const le = byteOrder === 0x4949;
  if (!le && byteOrder !== 0x4d4d) return null;
  const u16 = (o) => view.getUint16(o, le);
  const u32 = (o) => view.getUint32(o, le);

  const readIfd = (ifdOffset) => {
    const base = tiff + ifdOffset;
    const count = u16(base);
    let result = null;
    for (let i = 0; i < count; i++) {
      const entry = base + 2 + i * 12;
      const tag = u16(entry);
      if (tag === 0xa405) {
        result = u16(entry + 8);
        if (result > 0) return result;
      }
    }
    return result;
  };

  const ifd0 = u32(4);
  const fromIfd0 = readIfd(ifd0);
  if (fromIfd0) return fromIfd0;

  const base = tiff + ifd0;
  const count = u16(base);
  for (let i = 0; i < count; i++) {
    const entry = base + 2 + i * 12;
    if (u16(entry) === 0x8769) {
      const sub = readIfd(u32(entry + 8));
      if (sub) return sub;
    }
  }
  return null;
}
