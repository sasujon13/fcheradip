import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { CartComponent } from './component/cart/cart.component';
import { ProductsComponent } from './component/products/products.component';
import { BlogComponent } from './component/blog/blog.component';
import { ContactUsComponent } from './component/contact-us/contact-us.component';
import { AboutUsComponent } from './component/about-us/about-us.component';
import { OrderComponent } from './component/order/order.component';
import { FaqsComponent } from './component/faqs/faqs.component';
import { ChoiceComponent } from './component/choice/choice.component';
import { LoginComponent } from './component/login/login.component';
import { AuthGuard } from './service/authgard.service';
import { Router } from '@angular/router';
import { AuthComponent } from './component/auth/auth.component';
import { AdminComponent } from './component/admin/admin.component';

const routes: Routes = [
  {path:'', redirectTo:'products',pathMatch:'full'},
  {path:'products', component: ProductsComponent},
  {path:'blog', component: BlogComponent},
  {path:'faqs', component: FaqsComponent},
  {path:'about_us', component: AboutUsComponent},
  {path:'contact_us', component: ContactUsComponent},
  {path:'choice', component: ChoiceComponent},
  {path:'order', component: OrderComponent, canActivate: [AuthGuard]},
  {path:'cart', component: CartComponent},
  {path:'login', component: LoginComponent},
  {path:'auth/login', redirectTo:'login',pathMatch:'full'},
  {path:'auth', component: AuthComponent},
  {path: 'admin', component: AdminComponent},
  {path:'login/auth', redirectTo:'auth',pathMatch:'full'},
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})

export class AppRoutingModule {
  constructor(private router: Router) {}

onLoginSuccess() {
  this.router.navigate(['/order']);
}

onSignupSuccess() {
  this.router.navigate(['/order']);
  }
}
