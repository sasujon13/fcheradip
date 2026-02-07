import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-chapternavigator',
  templateUrl: './chapternavigator.component.html',
  styleUrls: ['./chapternavigator.component.css']
})
export class ChapterNavigatorComponent implements OnInit {
  @Input() chapters: any[] = [];
  @Input() currentChapter: string = '';
  @Output() chapterChange = new EventEmitter<string>();

  constructor() { }

  ngOnInit(): void {
  }

  onChapterClick(chapter: string): void {
    this.chapterChange.emit(chapter);
  }
}

