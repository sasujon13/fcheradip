import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.css']
})
export class BreadcrumbComponent {
  @Input() items: { label: string; route?: string }[] = [];

  defaultItems = [
    { label: 'Home', route: '/index' },
    { label: 'Create Question' }
  ];
}

