import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from 'src/app/service/api.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatSnackBar } from '@angular/material/snack-bar';


@Component({
  selector: 'app-auth',
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})

export class AuthComponent implements OnInit {
  authForm: FormGroup;
  isMobileNumberRegistered = false;
  isPasswordLength = false;
  showPassword: boolean = false;

  divisions: string[] = [];
  districts: string[] = [];
  thanas: string[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private apiService: ApiService,
    private snackBar: MatSnackBar,
  ) {
    this.authForm = this.fb.group({
      // ... form controls ...
    });
  }

  ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');

    const scienceC = document.getElementById('science');
    const businessC = document.getElementById('business');
    const humanitiesC = document.getElementById('humanities');

    const science = document.getElementById('scienceSubjects');
    const science2 = document.getElementById('scienceSubjects2');
    const arts = document.getElementById('humanitiesSubjects');
    const arts2 = document.getElementById('humanitiesSubjects2');
    const arts3 = document.getElementById('humanitiesSubjects3');
    const business = document.getElementById('businessSubjects');
    const business2 = document.getElementById('businessSubjects2');
    const business3 = document.getElementById('businessSubjects3');
  
    if (scienceC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'flex';
      science2.style.display = 'flex';

      arts.style.display = 'none';
      arts2.style.display = 'none';
      arts3.style.display = 'none';

      business.style.display = 'none';
      business2.style.display = 'none';
      business3.style.display = 'none';
    }
    
    if (humanitiesC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'none';
      science2.style.display = 'none';

      arts.style.display = 'flex';
      arts2.style.display = 'flex';
      arts3.style.display = 'flex';

      business.style.display = 'none';
      business2.style.display = 'none';
      business3.style.display = 'none';
    }
    
    if (businessC && arts && arts2 && arts3 && business && business2 && business3 && science && science2) {

      science.style.display = 'none';
      science2.style.display = 'none';

      arts.style.display = 'none';
      arts2.style.display = 'none';
      arts3.style.display = 'none';

      business.style.display = 'flex';
      business2.style.display = 'flex';
      business3.style.display = 'flex';
    }
    
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }
    this.fetchDivisions();
    const savedAuthFormData = localStorage.getItem('authFormData');
    if (savedAuthFormData) {
      const authData = JSON.parse(savedAuthFormData);
      this.authForm.patchValue(authData);
    }
    this.authForm = this.fb.group({
      acctype: ['student', [Validators.required, Validators.maxLength(7)]],
      username: ['', [Validators.required, Validators.minLength(11), Validators.maxLength(11)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14)]],
      confirmpassword: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(14), this.confirmPasswordValidator()]],
      fullName: ['', [Validators.required, Validators.maxLength(31)]],
      group: ['science', [Validators.required, Validators.maxLength(18)]],
      gender: ['Male', [Validators.required, Validators.maxLength(6)]],
      division: ['', [Validators.required, Validators.maxLength(31)]],
      district: ['', [Validators.required, Validators.maxLength(31)]],
      thana: ['', [Validators.required, Validators.maxLength(31)]],
      union: ['', [Validators.required, Validators.maxLength(31)]],
      village: ['', [Validators.required, Validators.maxLength(255)]]
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
          this.isMobileNumberRegistered = response.exists;
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
        if (!response)
          this.isPasswordLength = true;
        else
          this.isPasswordLength = false;
      });


  }

  onAuth() {
    if (this.authForm.valid && this.isMobileNumberRegistered == false) {
      const acctype = this.authForm.value.acctype;
      const username = this.authForm.value.username;
      const password = this.authForm.value.password;
      const fullName = this.authForm.value.fullName;
      const group = this.authForm.value.group;
      const gender = this.authForm.value.gender;
      const division = this.authForm.value.division;
      const district = this.authForm.value.district;
      const thana = this.authForm.value.thana;
      const union = this.authForm.value.union;
      const village = this.authForm.value.village;
      const formData = this.authForm.value;
      localStorage.setItem('formData', JSON.stringify(formData));
      this.apiService.signup(acctype, fullName, username, password, group, gender, division, district, thana, union, village).subscribe(
        (response) => {
          this.snackBar.open('Signup Successful!', 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar'],
          });
          this.logout();
          const returnUrl = localStorage.getItem('returnUrl') || ''; // Default to root if returnUrl is not set
          this.router.navigate([returnUrl]);
          localStorage.setItem('returnUrl', '');
          localStorage.setItem('username', username);
          localStorage.setItem('fullName', fullName);
          localStorage.setItem('union', union);
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('authToken', response)
          localStorage.setItem('formData', JSON.stringify(formData));
        },
        (error) => {
          console.error('Signup error:', error);
        }
      );
    } else {
      this.authForm.markAllAsTouched();
    }
  }

  onDivisionChange(): void {
    const selectedDivision = this.authForm.get('division')?.value;
    if (selectedDivision) {
      this.apiService.getDistricts(selectedDivision).subscribe(districts => {
        this.districts = districts;
      });
    }
  }

  onDistrictChange(): void {
    const selectedDivision = this.authForm.get('division')?.value;
    const selectedDistrict = this.authForm.get('district')?.value;
    if (selectedDivision && selectedDistrict) {
      this.apiService.getThanas(selectedDivision, selectedDistrict).subscribe(thanas => {
        this.thanas = thanas;
      });
    }
  }

  fetchDivisions() {
    this.apiService.getDivisions().subscribe(
      (data: string[]) => {
        this.divisions = data;
      },
      error => {
        console.error('Error fetching divisions:', error);
      }
    );
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
  
  confirmPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): { [key: string]: any } | null => {
      const newpassword = this.authForm.get('newpassword')?.value;
      const confirmpassword = control.value;

      if (newpassword === confirmpassword) {
        return null; // Validation passes, passwords match
      } else {
        return { 'passwordMismatch3': true }; // Validation fails, passwords do not match
      }
    };
  }

}