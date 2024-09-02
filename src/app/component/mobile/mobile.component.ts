import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ValidatorFn, AbstractControl } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-mobile',
  templateUrl: './mobile.component.html',
  styleUrls: ['./mobile.component.css']
})
export class MobileComponent implements OnInit {
  @ViewChild('consoleOutput') consoleOutput: ElementRef | undefined;
  authForm: FormGroup;
  isPasswordMismatch = false;
  isPasswordMismatch3 = false;
  isMobileNumberRegistered = false;
  isPasswordLength = false;
  isUserNameLength = false;
  showPassword: boolean = false;
  jsonData: any;
  username: any = '';
  newusername: any = '';

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
  ) {
    this.authForm = this.fb.group({
      // ... form controls ...
    });

    this.username = localStorage.getItem('username');
  }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }

    const savedAuthFormData = localStorage.getItem('authFormData');
    if (savedAuthFormData) {
      const authData = JSON.parse(savedAuthFormData);
      this.authForm.patchValue(authData);
    }
    this.authForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11)]],
      newusername: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
    });
    this.authForm.get('username')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((username) => {
          if (username.length === 11) {
            return this.apiService.checkMobileNumberExists(username);
          }
          return of(false);
        })
      )
      .subscribe((response: any) => {
        if (!response)
          this.isMobileNumberRegistered = false;
        else if (typeof response === 'object' && response.hasOwnProperty('exists')) {
          const check = response.exists;
          if (check === false)
            this.isMobileNumberRegistered = true;
          else
            this.isMobileNumberRegistered = false;
        }
      });

      this.authForm.get('password')?.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((password) => {
          const username = this.authForm.get('username')?.value;
          if (password.length > 5 && password.length < 15) {
            return this.apiService.checkPasswordExists(username, password);

          }
          return of(false);
        })
      )
      .subscribe((response: any) => {
        if (!response) {
          this.isPasswordLength = true;
          this.isPasswordMismatch = false;
        }
        else if (typeof response === 'object' && response.hasOwnProperty('exists')) {
          const check = response.exists;
          this.isPasswordLength = false;
          if (check === false)
            this.isPasswordMismatch = true;
          else
            this.isPasswordMismatch = false;
        }
      });
      
    this.authForm.get('newusername')?.valueChanges
    .pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((newusername) => {
        if (newusername.length === 11) {
          return this.apiService.checkMobileNumberExists(newusername);
        }
        return of(false);
      })
    )
    .subscribe((response: any) => {
      if (!response)
        this.isMobileNumberRegistered = false;
      else if (typeof response === 'object' && response.hasOwnProperty('exists')) {
        const check = response.exists;
        if (check === false)
          this.isMobileNumberRegistered = false;
        else
          this.isMobileNumberRegistered = true;
      }
    });
  }
  hasEmptyFields() {
    const formControls = this.authForm.controls;
    for (const key in formControls) {
      if (formControls[key].value === '') {
        return true;
      }
    }
    return false;
  }
  onAuth() {
    this.authForm.markAllAsTouched();
    if (this.hasEmptyFields()) {
      this.handleResponse("Please Fillup the Red-Marked Fields!");
    }
    else {
      if (this.authForm.valid) {
        const username = this.authForm.value.username;
        const newusername = this.authForm.value.newusername;
        const password = this.authForm.value.password;
        const formData = this.authForm.value;
        localStorage.setItem('formData', JSON.stringify(formData));
        this.apiService.updateMobile(username, newusername, password).subscribe(
          (response) => {
            this.snackBar.open('Mobile Update Successful!', 'Close', {
              duration: 3000,
              panelClass: ['success-snackbar'],
            });
            this.logout();
            const returnUrl = localStorage.getItem('returnUrl') || '';
            this.router.navigate([returnUrl]);
            localStorage.setItem('returnUrl', '');
            localStorage.setItem('username', newusername);
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('authToken', response)
            localStorage.setItem('formData', JSON.stringify(formData));
          },
          (error) => {
            console.error('Signup error:', error);
          }
        );
      } else {
        this.handleResponse("You have Invalid Data! Please Correct!");
        this.authForm.markAllAsTouched();
      }
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }
  logout(): void {
    const menu_item0 = document.getElementById('menu_item0');
    const menu_item1 = document.getElementById('menu_item1');
    const menu_item2 = document.getElementById('menu_item2');
    const profileMenu = document.getElementById('profileMenu');
    const sign_menu = document.getElementById('sign_menu');
    if (menu_item2 && menu_item1 && menu_item0 && profileMenu && sign_menu) {
      menu_item2.style.display = 'block';
      menu_item1.style.display = 'none';
      menu_item0.style.display = 'none';
      sign_menu.style.display = 'none';
      profileMenu.style.display = 'block';
    }
  }

  handleResponse(response: any) {

    if (this.consoleOutput) {
      const consoleOutputDiv = this.consoleOutput.nativeElement;
      consoleOutputDiv.textContent = '';
    }
    const formattedMessage = this.formatResponseMessage(response);

    // Append the formatted console output message
    if (this.consoleOutput) {
      const consoleOutputDiv = this.consoleOutput.nativeElement;
      consoleOutputDiv.textContent = formattedMessage;
    }
  }
  formatResponseMessage(response: any): string {
    let formattedMessage = JSON.stringify(response);

    // Remove curly braces {}
    formattedMessage = formattedMessage.replace(/[{()}]/g, '');

    // Remove "error:" and "message:"
    formattedMessage = formattedMessage.replace(/"error":/g, '');
    formattedMessage = formattedMessage.replace(/"message":/g, '');

    // Trim leading and trailing whitespace
    formattedMessage = formattedMessage.trim();
    if (formattedMessage.includes("Order Created Successfully")) {
      this.snackBar.open('Order Created Successfully!', 'Close', {
        duration: 3000,
        panelClass: ['success-snackbar'],
      });
      this.router.navigate(['/products']);
    }
    return formattedMessage;
  }
}