/**
 * App routing. Route list matches CHERADIP_PROJECT.md § Routing.
 */
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CartComponent } from './component/cart/cart/cart.component';
import { PackagesComponent } from './component/products/packages/packages.component';
import { BooksComponent } from './component/products/books/books.component';
import { AboutComponent } from './component/user/about/about.component';
import { ChatComponent } from './component/faqs/chat/chat.component';
import { OrderComponent } from './component/cart/order/order.component';
import { FaqsComponent } from './component/faqs/faqs/faqs.component';
import { ChoiceComponent } from './component/cart/choice/choice.component';
import { LoginComponent } from './component/user/login/login.component';
import { AuthGuard } from './service/authgard.service';
import { SignupComponent } from './component/user/signup/signup.component';
import { AdminComponent } from './component/user/admin/admin.component';
import { ProfileComponent } from './component/user/profile/profile.component';
import { MyorderComponent } from './component/cart/myorder/myorder.component';
import { PasswordComponent } from './component/user/password/password.component';
import { MobileComponent } from './component/user/mobile/mobile.component';
import { IndexComponent } from './component/index/index.component';
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

const routes: Routes = [
  {path:'', redirectTo:'index',pathMatch:'full'},
  {path:'packages', component: PackagesComponent},
  {path:'faqs', component: FaqsComponent},
  {path:'about_us', component: AboutComponent},
  {path:'live_chat', component: ChatComponent},
  {path:'books', component: BooksComponent},
  {path:'ntrca', component: NtrcaComponent},
  {path:'vacant7', component: Vacant7Component},
  {path:'vacant8', component: Vacant8Component},
  {path:'vacant5', component: Vacant5Component},
  {path:'vacant6', component: Vacant6Component},
  {path:'merit7', component: Merit7Component},
  {path:'merit8', component: Merit8Component},
  {path:'merit5', component: Merit5Component},
  {path:'merit6', component: Merit6Component},
  {path:'institute', component: BanbeisComponent},
  {
    path: 'institutes',
    children: [
      { path: '', component: InstituteComponent },
      { path: '**', component: CollegeThemeComponent }
    ]
  },
  {path:'recommend7', component: Recommend7Component},
  {path:'recommend8', component: Recommend8Component},
  {path:'recommend5', component: Recommend5Component},
  {path:'recommend6', component: Recommend6Component},
  {path:'choice', component: ChoiceComponent},
  {path:'order', component: OrderComponent, canActivate: [AuthGuard]},
  {path:'cart', component: CartComponent},
  {path:'scrape', component: ScraperComponent},
  {path:'index', component: IndexComponent},
  {path:'login', component: LoginComponent},
  {path:'auth', component: SignupComponent},
  {path:'auth/login', redirectTo:'login',pathMatch:'full'},
  {path:'login/auth', redirectTo:'auth',pathMatch:'full'},
  {path: 'admin', component: AdminComponent},
  {path: 'myorder', component: MyorderComponent, canActivate: [AuthGuard]},
  {path: 'profile', component: ProfileComponent, canActivate: [AuthGuard]},
  {path: 'password', component: PasswordComponent, canActivate: [AuthGuard]},
  {path: 'mobile', component: MobileComponent, canActivate: [AuthGuard]},
  {path: 'question', component: QuestionComponent},
  {path: 'question/create', component: QuestionCreatorComponent},
  {path: 'question/:subject', component: QuestionComponent},
  {path: 'question/:subject/chapter/:chapterName', component: QuestionComponent},
  {path: 'question/:subject/chapter/:chapterName/question/:id', component: QuestionComponent},
  {path: 'question/:subject/chapter/:chapterName/new', component: QuestionComponent},
  {
    path: 'student',
    component: StudentComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'liveexam', component: LiveexamComponent },
      { path: 'archive', component: ArchiveComponent },
      { path: 'exam/:id', component: ExamComponent },
      { path: 'report', component: ReportComponent },
      { path: 'stats', component: StatsComponent },
      { path: 'leaderboard', component: LeaderboardComponent },
      { path: 'tutor', component: TutorComponent }
    ]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule {
  constructor() {}
}

