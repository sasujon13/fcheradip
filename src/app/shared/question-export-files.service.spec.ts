import { QuestionExportFilesService } from './question-export-files.service';

describe('ready question files', () => {
  let service: QuestionExportFilesService;
  let previousPicker: unknown;
  beforeEach(() => {
    localStorage.clear();
    service = new QuestionExportFilesService();
    previousPicker = (window as any).showDirectoryPicker;
  });
  afterEach(() => {
    (window as any).showDirectoryPicker = previousPicker;
    localStorage.clear();
  });
  it('keeps direct PDF/DOCX files and prevents unsafe or duplicate names', () => {
    service.publish([new Blob(['pdf']), new Blob(['docx'])], ['../paper.pdf', '../paper.pdf'], 'Exam');
    expect(service.files.map(f => f.name)).toEqual(['_paper.pdf', '_paper (2).pdf']);
    expect(service.files[0].blob.type).not.toBe('application/zip');
  });
  it('does not expose the previous account export after login/logout', () => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('username', 'one');
    localStorage.setItem('authToken', 'one-token');
    service.publish([new Blob(['file'])], ['paper.pdf'], 'Exam');
    expect(service.files.length).toBe(1);
    localStorage.setItem('username', 'two');
    expect(service.files).toEqual([]);
  });
  it('writes every file into a fresh folder without replacing an older export', async () => {
    service.publish([new Blob(['pdf']), new Blob(['docx'])], ['paper.pdf', 'paper.docx'], 'Exam');
    spyOnProperty(service, 'folderSupported').and.returnValue(true);
    const writer = {write: jasmine.createSpy().and.resolveTo(), close: jasmine.createSpy().and.resolveTo(), abort: jasmine.createSpy().and.resolveTo()};
    const folder = {getFileHandle: jasmine.createSpy().and.resolveTo({createWritable: async () => writer})};
    const root = {getDirectoryHandle: jasmine.createSpy().and.callFake(async (name, options) => {
      if (name === 'Exam') return {};
      if (!options) throw new DOMException('Missing', 'NotFoundError');
      return folder;
    })};
    (window as any).showDirectoryPicker = jasmine.createSpy().and.resolveTo(root);
    await service.saveFolder();
    expect(root.getDirectoryHandle).toHaveBeenCalledWith('Exam (2)', {create: true});
    expect(folder.getFileHandle).toHaveBeenCalledWith('paper.pdf', {create: true});
    expect(folder.getFileHandle).toHaveBeenCalledWith('paper.docx', {create: true});
    expect(writer.close).toHaveBeenCalledTimes(2);
    expect(service.message).toContain('Saved 2 files');
    expect(service.busy).toBeFalse();
  });
  it('keeps files available when folder selection is cancelled', async () => {
    service.publish([new Blob(['file'])], ['paper.pdf'], 'Exam');
    spyOnProperty(service, 'folderSupported').and.returnValue(true);
    (window as any).showDirectoryPicker = () => Promise.reject(new DOMException('Cancelled', 'AbortError'));
    await service.saveFolder();
    expect(service.files.length).toBe(1);
    expect(service.message).toContain('cancelled');
    expect(service.busy).toBeFalse();
  });
  it('automatically downloads a ZIP, keeps individual files and reports completion', async () => {
    const download = spyOn(service as any, 'saveBlob');
    await service.publishAndDownload([new Blob(['pdf']), new Blob(['docx'])], ['paper.pdf', 'paper.docx'], 'Exam');
    expect(download).toHaveBeenCalledTimes(1);
    expect((download.calls.mostRecent().args[0] as Blob).type).toBe('application/zip');
    expect(download.calls.mostRecent().args[1]).toBe('Exam.zip');
    expect(service.zipDownloaded()).toBeTrue();
    expect(service.progress()?.percent).toBe(100);
    expect(service.files.length).toBe(2);
  });
  it('shows progress within a large file instead of waiting for the whole folder', async () => {
    service.publish([new Blob([new Uint8Array(8 * 1024 * 1024)])], ['large.pdf'], 'Exam');
    spyOnProperty(service, 'folderSupported').and.returnValue(true);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const writer = {write: jasmine.createSpy().and.returnValues(Promise.resolve(), pending),
      close: jasmine.createSpy().and.resolveTo(), abort: jasmine.createSpy().and.resolveTo()};
    const folder = {getFileHandle: async () => ({createWritable: async () => writer})};
    (window as any).showDirectoryPicker = async () => ({getDirectoryHandle: async (_name: string, options: unknown) => {
      if (!options) throw new DOMException('Missing', 'NotFoundError');
      return folder;
    }});
    const saving = service.saveFolder();
    for (let i = 0; i < 15; i++) await Promise.resolve();
    expect(service.busy).toBeTrue();
    expect(service.progress()?.completedBytes).toBe(4 * 1024 * 1024);
    expect(service.progress()?.percent).toBe(50);
    expect(service.progress()?.filename).toBe('large.pdf');
    expect(service.progress()?.completedFiles).toBe(0);
    release();
    await saving;
    expect(service.progress()?.percent).toBe(100);
    expect(service.progress()?.completedFiles).toBe(1);
    expect(service.busy).toBeFalse();
  });
});
