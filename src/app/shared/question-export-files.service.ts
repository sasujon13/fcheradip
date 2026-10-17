import { Injectable, signal } from '@angular/core';
import { accountSessionKey } from '../service/account-session-state';
import { questionExportDownload, QuestionZipProgress } from './question-export-download';

export interface ReadyQuestionFile { blob: Blob; name: string; }
export interface QuestionFileProgress extends QuestionZipProgress { phase: string; percent: number; }
interface ExportDirectory {
  getDirectoryHandle(name: string, options?: {create: boolean}): Promise<ExportDirectory>;
  getFileHandle(name: string, options: {create: boolean}): Promise<{
    createWritable(): Promise<{write(blob: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void>}>;
  }>;
}
type FolderWindow = Window & {showDirectoryPicker?: (options: {mode: string}) => Promise<ExportDirectory>};

/** Keep the latest paid/accepted export across the creator -> saved-sets navigation.
 * Individual links are explicit user gestures, so mobile browsers cannot silently
 * block the second and later files as they can with automatic multi-downloads. */
@Injectable({providedIn: 'root'})
export class QuestionExportFilesService {
  private ready = signal<ReadyQuestionFile[]>([]);
  private owner = '';
  bundleName = 'Questions';
  private busyState = signal(false);
  private messageState = signal('');
  readonly zipDownloaded = signal(false);
  readonly progress = signal<QuestionFileProgress | null>(null);
  get busy(): boolean { return this.busyState(); }
  set busy(value: boolean) { this.busyState.set(value); }
  get message(): string { return this.messageState(); }
  set message(value: string) { this.messageState.set(value); }

  get files(): ReadyQuestionFile[] {
    const owner = accountSessionKey();
    if (this.owner !== owner) {
      this.ready.set([]);
      this.owner = owner;
      this.message = '';
      this.zipDownloaded.set(false);
      this.progress.set(null);
    }
    return this.ready();
  }
  get folderSupported(): boolean {
    return window.isSecureContext && typeof (window as FolderWindow).showDirectoryPicker === 'function';
  }
  publish(blobs: Blob[], names: string[], bundleName: string, expectedOwner = accountSessionKey()): boolean {
    if (expectedOwner !== accountSessionKey()) return false;
    if (!blobs.length || blobs.length !== names.length) throw new Error('Export files are incomplete.');
    const used = new Set<string>();
    this.ready.set(blobs.map((blob, i) => {
      const original = this.safeName(names[i]);
      let name = original;
      let suffix = 2;
      while (used.has(name.toLowerCase())) {
        const dot = original.lastIndexOf('.');
        name = dot > 0 ? `${original.slice(0, dot)} (${suffix++})${original.slice(dot)}` : `${original} (${suffix++})`;
      }
      used.add(name.toLowerCase());
      return {blob, name};
    }));
    this.owner = accountSessionKey();
    this.bundleName = this.safeName(bundleName);
    this.message = '';
    this.zipDownloaded.set(false);
    this.progress.set(null);
    return true;
  }
  async publishAndDownload(blobs: Blob[], names: string[], bundleName: string, expectedOwner = accountSessionKey()): Promise<void> {
    if (this.publish(blobs, names, bundleName, expectedOwner)) await this.downloadZip();
  }
  private report(phase: string, progress: QuestionZipProgress): void {
    const fraction = progress.totalBytes ? progress.completedBytes / progress.totalBytes : progress.completedFiles / Math.max(1, progress.totalFiles);
    this.progress.set({...progress, phase, percent: Math.min(99, Math.floor(fraction * 100))});
  }
  private safeName(value: string): string {
    let name = value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^[. ]+|[. ]+$/g, '') || 'Questions';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
    const extension = name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
    const stem = Array.from(extension ? name.slice(0, -extension.length) : name);
    // Linux limits filename bytes, not characters; leave space for duplicate suffixes.
    while (new TextEncoder().encode(stem.join('') + extension).length > 200) stem.pop();
    return (stem.join('') || 'Questions') + extension;
  }
  download(file: ReadyQuestionFile): void {
    if (!this.files.includes(file)) return;
    this.saveBlob(file.blob, file.name);
  }
  private saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 180_000);
  }
  async downloadZip(): Promise<void> {
    if (this.busy || !this.files.length) return;
    const files = [...this.files];
    const owner = this.owner;
    this.busy = true;
    this.message = '';
    this.report('Preparing ZIP', {completedFiles: 0, totalFiles: files.length, completedBytes: 0, totalBytes: files.reduce((sum, f) => sum + f.blob.size, 0), filename: ''});
    try {
      const result = await questionExportDownload(files.map(f => f.blob), files.map(f => f.name), this.bundleName, {
        forceZip: true, onProgress: progress => this.report('Preparing ZIP', progress),
      });
      if (owner === accountSessionKey()) {
        this.saveBlob(result.blob, result.filename);
        this.zipDownloaded.set(true);
        this.progress.update(value => value ? {...value, phase: 'ZIP download sent', percent: 100} : null);
      }
    } catch {
      this.message = 'Could not prepare ZIP. Download each file using its button instead.';
    } finally { this.busy = false; }
  }
  async saveFolder(): Promise<void> {
    if (this.busy || !this.files.length) return;
    if (!this.folderSupported) {
      this.message = 'Folder saving is not supported in this browser. Use the downloaded ZIP or the individual file buttons.';
      return;
    }
    const files = [...this.files];
    const owner = this.owner;
    const base = this.bundleName;
    this.busy = true;
    this.message = '';
    const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
    let completedBytes = 0;
    this.report('Choose a folder in the browser window', {completedFiles: 0, totalFiles: files.length, completedBytes, totalBytes, filename: ''});
    let written = 0;
    try {
      // Call directly from the button, before any other await, to retain user activation.
      const root = await (window as FolderWindow).showDirectoryPicker!({mode: 'readwrite'});
      if (owner !== accountSessionKey()) throw new Error('Your account changed.');
      this.report('Creating destination folder', {completedFiles: 0, totalFiles: files.length, completedBytes, totalBytes, filename: base});
      let name = base;
      let suffix = 2;
      for (;;) {
        try { await root.getDirectoryHandle(name); name = `${base} (${suffix++})`; }
        catch (error) {
          if (error instanceof DOMException && error.name === 'TypeMismatchError') { name = `${base} (${suffix++})`; continue; }
          if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
          break;
        }
      }
      // Use a fresh subfolder; never overwrite an existing user's export.
      const folder = await root.getDirectoryHandle(name, {create: true});
      for (const file of files) {
        if (owner !== accountSessionKey()) throw new Error('Your account changed.');
        this.report('Opening file for saving', {completedFiles: written, totalFiles: files.length, completedBytes, totalBytes, filename: file.name});
        const handle = await folder.getFileHandle(file.name, {create: true});
        const writer = await handle.createWritable();
        try {
          for (let start = 0; start < file.blob.size; start += 4 * 1024 * 1024) {
            if (owner !== accountSessionKey()) throw new Error('Your account changed.');
            const chunk = file.blob.slice(start, Math.min(start + 4 * 1024 * 1024, file.blob.size));
            this.report('Saving file', {completedFiles: written, totalFiles: files.length, completedBytes, totalBytes, filename: file.name});
            await writer.write(chunk);
            completedBytes += chunk.size;
            this.report('Saving file', {completedFiles: written, totalFiles: files.length, completedBytes, totalBytes, filename: file.name});
          }
          this.report('Finishing file', {completedFiles: written, totalFiles: files.length, completedBytes, totalBytes, filename: file.name});
          await writer.close();
        }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
        written++;
        this.report('Saving files', {completedFiles: written, totalFiles: files.length, completedBytes, totalBytes, filename: file.name});
      }
      this.progress.update(value => value ? {...value, phase: 'Folder saved', percent: 100} : null);
      this.message = `Saved ${written} files in “${name}”. No unzipping needed.`;
    } catch (error) {
      this.message = error instanceof DOMException && error.name === 'AbortError'
        ? 'Folder selection cancelled. Your files are still ready below.'
        : `Saved ${written} of ${files.length} files. Use the individual download buttons for any remaining files.`;
    } finally { this.busy = false; }
  }
  clear(): void { if (!this.busy) { this.ready.set([]); this.message = ''; this.progress.set(null); this.zipDownloaded.set(false); } }
}
