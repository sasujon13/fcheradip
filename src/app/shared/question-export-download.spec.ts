import { Observable, of, throwError } from 'rxjs';
import { collectQuestionExportBlobs, questionExportDownload } from './question-export-download';

describe('question export delivery', () => {
  it('preserves local icon fonts and provides newer icon aliases without a remote kit', async () => {
    for (const cls of ['fa fa-home', 'fa fa-facebook', 'fab fa-facebook', 'fa fa-book-open', 'fas fa-wallet', 'fab fa-facebook-f', 'fa fa-sign-in', 'fa fa-file-word-o']) {
      const icon = document.createElement('i');
      icon.className = cls;
      document.body.appendChild(icon);
      try {
        expect(getComputedStyle(icon).fontFamily).toContain('Font Awesome 5');
        expect(getComputedStyle(icon, '::before').content).not.toBe('none');
        expect(getComputedStyle(icon, '::before').fontFamily).toContain('Font Awesome 5');
      } finally { icon.remove(); }
    }
    expect((await document.fonts.load('900 14px "Font Awesome 5 Free"')).length).toBeGreaterThan(0);
    expect((await document.fonts.load('14px "Font Awesome 5 Brands"')).length).toBeGreaterThan(0);
  });
  it('does not replace equation glyph fonts with the site body font', () => {
    const math = document.createElement('span');
    math.className = 'katex';
    const variable = document.createElement('span');
    variable.className = 'mathnormal';
    variable.textContent = 'x';
    math.appendChild(variable);
    document.body.appendChild(math);
    try {
      expect(getComputedStyle(variable).fontFamily).toContain('KaTeX_Math');
    } finally {
      math.remove();
    }
  });

  it('subscribes to only one export at a time and preserves file order', async () => {
    let running = 0;
    let peak = 0;
    const requests = ['pdf', 'docx', 'answers'].map(value => new Observable<Blob>(subscriber => {
      running++;
      peak = Math.max(peak, running);
      const timer = setTimeout(() => { subscriber.next(new Blob([value])); subscriber.complete(); }, 1);
      return () => { running--; clearTimeout(timer); };
    }));
    const result = await collectQuestionExportBlobs(requests);
    expect(peak).toBe(1);
    expect(await Promise.all(result.map(blob => blob.text()))).toEqual(['pdf', 'docx', 'answers']);
  });

  it('does not continue or return partial files after a rendering failure', async () => {
    let lastStarted = false;
    const last = new Observable<Blob>(() => { lastStarted = true; });
    await expectAsync(collectQuestionExportBlobs([of(new Blob(['ok'])),
      throwError(() => new Error('Image failed')), last])).toBeRejectedWithError('Image failed');
    expect(lastStarted).toBeFalse();
  });

  it('bundles files into one UTF-8 ZIP with correct CRC and directory offsets', async () => {
    const result = await questionExportDownload([new Blob(['123456789']), new Blob(['docx'])],
      ['প্রশ্ন.pdf', 'editable.docx'], 'paper');
    expect(result.filename).toBe('paper.zip');
    const buffer = await result.blob.arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(view.getUint16(6, true)).toBe(0x800);
    const end = buffer.byteLength - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const central = view.getUint32(end + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint32(central + 42, true)).toBe(0);
    expect(view.getUint32(central + 16, true)).toBe(0xcbf43926);
    expect(new TextDecoder().decode(new Uint8Array(buffer, 30, view.getUint16(26, true)))).toBe('প্রশ্ন.pdf');
  });

  it('keeps single-file downloads direct and rejects missing files', async () => {
    const blob = new Blob(['%PDF']);
    expect(await questionExportDownload([blob], ['paper.pdf'], 'paper')).toEqual({blob, filename: 'paper.pdf'});
    await expectAsync(questionExportDownload([], [], 'paper')).toBeRejected();
  });
  it('can wrap a single file in ZIP for automatic delivery and reports real byte progress', async () => {
    const progress: any[] = [];
    const blob = new Blob(['123456789']);
    const result = await questionExportDownload([blob], ['paper.pdf'], 'Exam', {forceZip: true, onProgress: value => progress.push(value)});
    expect(result.filename).toBe('Exam.zip');
    const view = new DataView(await result.blob.arrayBuffer());
    expect(view.getUint32(14, true)).toBe(0xcbf43926);
    expect(progress[progress.length - 1].completedFiles).toBe(1);
    expect(progress[progress.length - 1].completedBytes).toBe(9);
  });
});
