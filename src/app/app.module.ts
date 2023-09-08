import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './component/header/header.component';
import { CartComponent } from './component/cart/cart.component';
import { BlogComponent } from './component/blog/blog.component';
import { ContactUsComponent } from './component/contact-us/contact-us.component';
import { AboutUsComponent } from './component/about-us/about-us.component';
import { FaqsComponent } from './component/faqs/faqs.component';
import { OrderComponent } from './component/order/order.component';
import { ProductsComponent } from './component/products/products.component';
import { HttpClientModule } from '@angular/common/http';
import { FilterPipe } from './shared/filter.pipe';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ChoiceComponent } from './component/choice/choice.component';
import { AuthComponent } from './component/auth/auth.component';
import { LoginComponent } from './component/login/login.component';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminComponent } from './component/admin/admin.component';
import { ProfileComponent } from './component/profile/profile.component';
import { MyorderComponent } from './component/myorder/myorder.component';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    CartComponent,
    BlogComponent,
    ContactUsComponent,
    AboutUsComponent,
    FaqsComponent,
    OrderComponent,
    ProductsComponent,
    ChoiceComponent,
    FilterPipe,
    AuthComponent,
    LoginComponent,
    AdminComponent,
    ProfileComponent,
    MyorderComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    BrowserAnimationsModule,
    MatSnackBarModule,
  ],
  providers: [MatSnackBar,],
  bootstrap: [AppComponent],
})
export class AppModule { }
