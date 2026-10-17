import { firstValueFrom, Observable } from 'rxjs';

/** Keep production workers available; abort before Save charges if any file fails. */
export async function collectQuestionExportBlobs(requests: Observable<Blob>[]): Promise<Blob[]> {
  const blobs: Blob[] = [];
  for (const request of requests) blobs.push(await firstValueFrom(request));
  return blobs;
}

const ZIP_CRC_TABLE = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

export interface QuestionZipProgress {
  completedFiles: number; totalFiles: number; completedBytes: number; totalBytes: number; filename: string;
}

/** Uncompressed ZIP: PDF and DOCX are already compressed. One download avoids
 * browsers silently blocking the later files in a multi-set Save. */
export async function questionExportDownload(
  blobs: Blob[], names: string[], bundleName: string,
  options?: {forceZip?: boolean; onProgress?: (progress: QuestionZipProgress) => void}
): Promise<{blob: Blob; filename: string}> {
  if (!blobs.length || blobs.length !== names.length) throw new Error('No complete export files were generated.');
  if (blobs.length === 1 && !options?.forceZip) return {blob: blobs[0], filename: names[0]};
  if (blobs.length > 65535) throw new Error('Too many files for one ZIP. Download smaller groups.');
  const totalBytes = blobs.reduce((sum, blob) => sum + blob.size, 0);
  let completedBytes = 0;
  const parts: BlobPart[] = [];
  const directory: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;
  for (let index = 0; index < blobs.length; index++) {
    const bytes = new Uint8Array(await blobs[index].arrayBuffer());
    const name = new TextEncoder().encode(names[index].replace(/[\\/]/g, '_'));
    if (bytes.length > 0xffffffff || offset + bytes.length > 0xffffffff || name.length > 65535) {
      throw new Error('Export is too large for one ZIP. Download the saved sets separately.');
    }
    let crc = 0xffffffff;
    for (let start = 0; start < bytes.length; start += 4 * 1024 * 1024) {
      const end = Math.min(start + 4 * 1024 * 1024, bytes.length);
      for (let i = start; i < end; i++) crc = (crc >>> 8) ^ ZIP_CRC_TABLE[(crc ^ bytes[i]) & 0xff];
      completedBytes += end - start;
      options?.onProgress?.({completedFiles: index, totalFiles: blobs.length, completedBytes, totalBytes, filename: names[index]});
      // Let the browser paint progress rather than freezing during a large checksum.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = new ArrayBuffer(30);
    const header = new DataView(local);
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x800, true); // UTF-8 Bengali filenames
    header.setUint16(12, 0x21, true); // valid DOS date: Jan 1, 1980
    header.setUint32(14, crc, true);
    header.setUint32(18, bytes.length, true);
    header.setUint32(22, bytes.length, true);
    header.setUint16(26, name.length, true);
    parts.push(local, name, blobs[index]);
    const central = new ArrayBuffer(46);
    const entry = new DataView(central);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x800, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    directory.push(central, name);
    directorySize += 46 + name.length;
    offset += 30 + name.length + bytes.length;
    options?.onProgress?.({completedFiles: index + 1, totalFiles: blobs.length, completedBytes, totalBytes, filename: names[index]});
  }
  const end = new ArrayBuffer(22);
  const footer = new DataView(end);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, blobs.length, true);
  footer.setUint16(10, blobs.length, true);
  footer.setUint32(12, directorySize, true);
  footer.setUint32(16, offset, true);
  return {blob: new Blob([...parts, ...directory, end], {type: 'application/zip'}), filename: `${bundleName}.zip`};
}
