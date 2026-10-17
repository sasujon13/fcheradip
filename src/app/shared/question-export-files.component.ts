import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuestionExportFilesService } from './question-export-files.service';

@Component({
  selector: 'app-question-export-files',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section *ngIf="exports.files.length" class="export-files" aria-label="Ready question files">
      <h2>{{ exports.zipDownloaded() ? 'Zip file Downloaded' : 'Your files are ready' }}</h2>
      <p *ngIf="exports.zipDownloaded()">The ZIP download was sent to your browser. Check Downloads if it has not appeared.</p>
      <p>Download individual files below, or use Download All to save them in a folder. Files stay ready until you refresh or leave this account.</p>
      <div *ngIf="exports.progress() as progress" class="export-progress" role="status" aria-live="polite">
        <div>{{ progress.phase }} · {{ progress.completedFiles }}/{{ progress.totalFiles }} files · {{ progress.percent }}%</div>
        <progress [value]="progress.percent" max="100" aria-label="File download progress"></progress>
        <small *ngIf="progress.filename">{{ progress.filename }}</small>
      </div>
      <p *ngIf="exports.message" role="status">{{ exports.message }}</p>
      <ul><li *ngFor="let file of exports.files">
        <button type="button" (click)="exports.download(file)" [disabled]="exports.busy"><i class="fa fa-download" aria-hidden="true"></i> {{ file.name }}</button>
      </li></ul>
      <div class="export-actions">
        <button type="button" [disabled]="exports.busy" (click)="exports.saveFolder()" title="Choose a folder and save all prepared files without creating them again">Download All</button>
        <button type="button" [disabled]="exports.busy" (click)="exports.clear()">Dismiss</button>
      </div>
    </section>`,
  styles: [`
    .export-files {margin:16px 0;padding:16px;border:1px solid #b4d9d6;border-radius:10px;background:#f0faf9;color:#164f4d;}
    h2 {font-size:18px;margin:0 0 8px;} p {font-size:13px;line-height:1.6;}
    .export-actions {display:flex;flex-wrap:wrap;gap:8px;}
    .export-progress {margin:12px 0;overflow-wrap:anywhere;font-size:13px;}
    progress {display:block;width:100%;height:12px;margin:8px 0;accent-color:#008080;}
    button {padding:9px 12px;border:1px solid #008080;border-radius:7px;background:white;color:#006666;cursor:pointer;max-width:100%;overflow-wrap:anywhere;}
    button:hover,button:focus-visible {background:#d4eeeb;} button:disabled {opacity:.6;cursor:wait;}
    ul {list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:8px;max-height:340px;overflow:auto;}
    li button {width:100%;text-align:left;}
  `],
})
export class QuestionExportFilesComponent {
  constructor(public exports: QuestionExportFilesService) {}
}
