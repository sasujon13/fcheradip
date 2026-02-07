import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-chapter-navigator',
  templateUrl: './chapter-navigator.component.html',
  styleUrls: ['./chapter-navigator.component.css']
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

