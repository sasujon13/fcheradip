import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CartComponent } from './component/cart/cart.component';
import { ProductsComponent } from './component/products/products.component';
import { BooksComponent } from './component/books/books.component';
import { AboutUsComponent } from './component/about-us/about-us.component';
import { CreateQuestionComponent } from './component/create-question/create-question.component';
import { LiveChatComponent } from './component/live-chat/live-chat.component';
import { OrderComponent } from './component/order/order.component';
import { FaqsComponent } from './component/faqs/faqs.component';
import { ChoiceComponent } from './component/choice/choice.component';
import { LoginComponent } from './component/login/login.component';
import { AuthGuard } from './service/authgard.service';
import { Router } from '@angular/router';
import { AuthComponent } from './component/auth/auth.component';
import { AdminComponent } from './component/admin/admin.component';
import { ProfileComponent } from './component/profile/profile.component';
import { MyorderComponent } from './component/myorder/myorder.component';
import { PasswordComponent } from './component/password/password.component';
import { MobileComponent } from './component/mobile/mobile.component';
import { IndexComponent } from './component/index/index.component';

const routes: Routes = [
  {path:'', redirectTo:'packages',pathMatch:'full'},
  {path:'packages', component: ProductsComponent},
  {path:'faqs', component: FaqsComponent},
  {path:'about_us', component: AboutUsComponent},
  {path:'create_question', component: CreateQuestionComponent},
  {path:'live_chat', component: LiveChatComponent},
  {path:'books', component: BooksComponent},
  {path:'choice', component: ChoiceComponent},
  {path:'order', component: OrderComponent, canActivate: [AuthGuard]},
  {path:'cart', component: CartComponent},
  {path:'index', component: IndexComponent},
  {path:'login', component: LoginComponent},
  {path:'auth', component: AuthComponent},
  {path:'auth/login', redirectTo:'login',pathMatch:'full'},
  {path:'login/auth', redirectTo:'auth',pathMatch:'full'},
  {path: 'admin', component: AdminComponent},
  {path: 'myorder', component: MyorderComponent, canActivate: [AuthGuard]},
  {path: 'profile', component: ProfileComponent, canActivate: [AuthGuard]},
  {path: 'password', component: PasswordComponent, canActivate: [AuthGuard]},
  {path: 'mobile', component: MobileComponent, canActivate: [AuthGuard]},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule {
  constructor() {}
}

