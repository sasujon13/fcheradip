import { Component, OnInit } from '@angular/core';
import { take } from 'rxjs/operators';
import { CountryService } from './service/country.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'Cheradip';

  constructor(private countryService: CountryService) {}

  ngOnInit(): void {
    // Preferred UI language: from storage or infer from country (e.g. BD -> bn). Data from country table.
    this.countryService.country$.pipe(take(1)).subscribe(c => {
      this.countryService.initPreferredLangFromCountry(c?.country_code);
    });
  }
}
