import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { HeaderComponent } from './component/header/header.component';
import { CartComponent } from './component/cart/cart.component';
import { BooksComponent } from './component/books/books.component';
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
import { PasswordComponent } from './component/password/password.component';
import { IndexComponent } from './component/index/index.component';
import { CreateQuestionComponent } from './component/create-question/create-question.component';
import { LiveChatComponent } from './component/live-chat/live-chat.component';
import { MobileComponent } from './component/mobile/mobile.component';

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    CartComponent,
    BooksComponent,
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
    PasswordComponent,
    IndexComponent,
    CreateQuestionComponent,
    LiveChatComponent,
    MobileComponent,
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
