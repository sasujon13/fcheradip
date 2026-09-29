import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';
import { AppComponent } from './app.component';
import { CountryService } from './service/country.service';
import { WelcomeBonusCeremonyService } from './service/welcome-bonus-ceremony.service';
import { AuthSessionService } from './service/auth-session.service';
import { TrxUnlockService } from './service/trx-unlock.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        RouterTestingModule
      ],
      declarations: [
        AppComponent
      ],
      providers: [
        {
          provide: CountryService,
          useValue: {
            country$: new BehaviorSubject(null),
            initPreferredLangFromCountry: jasmine.createSpy('initPreferredLangFromCountry')
          }
        },
        { provide: WelcomeBonusCeremonyService, useValue: { tryPlayAfterNavigation: jasmine.createSpy('tryPlayAfterNavigation') } },
        {
          provide: AuthSessionService,
          useValue: {
            startSessionMonitor: jasmine.createSpy('startSessionMonitor'),
            hasStoredSession: jasmine.createSpy('hasStoredSession').and.returnValue(false)
          }
        },
        { provide: TrxUnlockService, useValue: { fetchCoinBalance: jasmine.createSpy('fetchCoinBalance').and.returnValue(of({})) } }
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the Cheradip title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Cheradip');
  });

  it('should render the application page shell', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('.app-page-shell')).toBeTruthy();
  });
});
