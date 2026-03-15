import { NgModule, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';

import { UrlSerializer } from '@angular/router';
import { ParenthesisSafeUrlSerializer } from './url-serializer';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './shared/header/header.component';
import { CartComponent } from './component/cart/cart/cart.component';
import { BooksComponent } from './component/products/books/books.component';
import { FaqsComponent } from './component/faqs/faqs/faqs.component';
import { OrderComponent } from './component/cart/order/order.component';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { LanguageInterceptor } from './service/language.interceptor';
import { FilterPipe } from './shared/filter.pipe';
import { SafeUrlPipe } from './shared/safe-url.pipe';
import { OrderByPipe } from './shared/orderBy.pipe';
import { hDirective } from './shared/hfilter.directive';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ChoiceComponent } from './component/cart/choice/choice.component';
import { LoginComponent } from './component/user/login/login.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminComponent } from './component/user/admin/admin.component';
import { ProfileComponent } from './component/user/profile/profile.component';
import { MyorderComponent } from './component/cart/myorder/myorder.component';
import { PasswordComponent } from './component/user/password/password.component';
import { IndexComponent } from './component/index/index.component';
import { MobileComponent } from './component/user/mobile/mobile.component';
import { SignupComponent } from './component/user/signup/signup.component';
import { CountrySelectorComponent } from './shared/country-selector/country-selector.component';
import { AlertComponent } from './component/faqs/alert/alert.component';
import { NtrcaFooterSectionComponent } from './shared/ntrca-footer-section/ntrca-footer-section.component';
import { NtrcaHeaderSectionComponent } from './shared/ntrca-header-section/ntrca-header-section.component';
import { AboutComponent } from './component/user/about/about.component';
import { ChatComponent } from './component/faqs/chat/chat.component';
import { PackagesComponent } from './component/products/packages/packages.component';
import { NtrcaComponent } from './component/ntrca/ntrca/ntrca.component';
import { Vacant7Component } from './component/ntrca/vacant7/vacant7.component';
import { Vacant8Component } from './component/ntrca/vacant8/vacant8.component';
import { Vacant5Component } from './component/ntrca/vacant5/vacant5.component';
import { Vacant6Component } from './component/ntrca/vacant6/vacant6.component';
import { Merit7Component } from './component/ntrca/merit7/merit7.component';
import { Merit8Component } from './component/ntrca/merit8/merit8.component';
import { Merit5Component } from './component/ntrca/merit5/merit5.component';
import { Merit6Component } from './component/ntrca/merit6/merit6.component';
import { BanbeisComponent } from './component/ntrca/banbeis/banbeis.component';
import { Recommend7Component } from './component/ntrca/recommend7/recommend7.component';
import { Recommend8Component } from './component/ntrca/recommend8/recommend8.component';
import { Recommend5Component } from './component/ntrca/recommend5/recommend5.component';
import { Recommend6Component } from './component/ntrca/recommend6/recommend6.component';
import { InstituteComponent } from './component/ntrca/institute/institute.component';
import { CollegeThemeComponent } from './component/ntrca/college-theme/college-theme.component';
import { QuestionComponent } from './component/question/question/question.component';
import { QuestionCreatorComponent } from './component/question/question-creator/question-creator.component';
import { StudentComponent } from './component/student/student/student.component';
import { DashboardComponent } from './component/student/dashboard/dashboard.component';
import { LiveexamComponent } from './component/student/liveexam/liveexam.component';
import { ArchiveComponent } from './component/student/archive/archive.component';
import { ExamComponent } from './component/student/exam/exam.component';
import { ReportComponent } from './component/student/report/report.component';
import { StatsComponent } from './component/student/stats/stats.component';
import { LeaderboardComponent } from './component/student/leaderboard/leaderboard.component';
import { TutorComponent } from './component/student/tutor/tutor.component';
import { ScraperComponent } from './component/scraper/scraper/scraper.component';
import { BreadcrumbComponent } from './component/question/navigation/breadcrumb/breadcrumb.component';
import { SubjectSelectorComponent } from './component/question/navigation/subjectselector/subjectselector.component';
import { ChapterNavigatorComponent } from './component/question/navigation/chapternavigator/chapternavigator.component';
import { SearchBarComponent } from './component/question/filters/searchbar/searchbar.component';
import { AdvancedFiltersComponent } from './component/question/filters/advancedfilters/advancedfilters.component';
import { QuestionListComponent } from './component/question/questionlist/questionlist.component';
import { QuestionCardComponent } from './component/question/questioncard/questioncard.component';
import { QuestionFormComponent } from './component/question/questionform/questionform.component';
import { QuestionEditorComponent } from './component/question/questioneditor/questioneditor.component';
import { McqOptionsComponent } from './component/question/mcqoptions/mcqoptions.component';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    CartComponent,
    BooksComponent,
    AboutComponent,
    FaqsComponent,
    ChatComponent,
    OrderComponent,
    PackagesComponent,
    ChoiceComponent,
    FilterPipe,
    SafeUrlPipe,
    OrderByPipe,
    hDirective,
    LoginComponent,
    AlertComponent,
    NtrcaFooterSectionComponent,
    NtrcaHeaderSectionComponent,
    AdminComponent,
    ProfileComponent,
    MyorderComponent,
    PasswordComponent,
    IndexComponent,
    MobileComponent,
    NtrcaComponent,
    Vacant7Component,
    Vacant8Component,
    Vacant5Component,
    Vacant6Component,
    Merit7Component,
    Merit8Component,
    Merit5Component,
    Merit6Component,
    BanbeisComponent,
    Recommend7Component,
    Recommend8Component,
    Recommend5Component,
    Recommend6Component,
    InstituteComponent,
    CollegeThemeComponent,
    QuestionComponent,
    QuestionCreatorComponent,
    BreadcrumbComponent,
    SubjectSelectorComponent,
    ChapterNavigatorComponent,
    SearchBarComponent,
    AdvancedFiltersComponent,
    QuestionListComponent,
    QuestionCardComponent,
    QuestionFormComponent,
    QuestionEditorComponent,
    McqOptionsComponent,
    StudentComponent,
    DashboardComponent,
    LiveexamComponent,
    ArchiveComponent,
    ExamComponent,
    ReportComponent,
    StatsComponent,
    LeaderboardComponent,
    TutorComponent,
    ScraperComponent,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    MatSnackBarModule,
    SignupComponent,
    CountrySelectorComponent,
  ],
  providers: [
    MatSnackBar,
    { provide: HTTP_INTERCEPTORS, useClass: LanguageInterceptor, multi: true },
    { provide: UrlSerializer, useClass: ParenthesisSafeUrlSerializer },
  ],
  bootstrap: [AppComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AppModule { }
