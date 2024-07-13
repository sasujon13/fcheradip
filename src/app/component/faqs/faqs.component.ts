import { Component, OnInit, Renderer2, ElementRef, HostListener } from '@angular/core';

@Component({
  selector: 'app-faqs',
  templateUrl: './faqs.component.html',
  styleUrls: ['./faqs.component.css']
})
export class FaqsComponent implements OnInit {
  constructor(private renderer: Renderer2, private el: ElementRef) { }
  
  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

  if (searchBarElement) {
    searchBarElement.style.display = 'none';
  }
    this.applyMargin();
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }
  
  @HostListener('window:resize')
  onWindowResize() {
    this.applyMargin();
  }
  
  private applyMargin() {
    const screenWidth = window.innerWidth;
    let marginLeft: number | string = "auto";
    
    if (screenWidth < 1024 && screenWidth > 649) {
      marginLeft = ((screenWidth - 1024) / 2) + "px";
      
      const noteBgElements = this.el.nativeElement.querySelectorAll('.notebg');
      noteBgElements.forEach((element: HTMLElement) => {
        this.renderer.setStyle(element, 'margin-left', marginLeft);
      });
    }
  }
}
