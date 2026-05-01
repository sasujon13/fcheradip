import { Component, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';
import { CartService } from 'src/app/service/cart.service';
import { ChoiceService } from 'src/app/service/choice.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-ntrca',
  templateUrl: './ntrca.component.html',
  styleUrls: ['./ntrca.component.css']
})

export class NtrcaComponent implements OnInit {
  baseUrl: string = `${environment.apiUrl}/vacancy6/`
  baseUrl2: string = `${environment.apiUrl}/institute/`
  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;
  private isDown = false;
  private startX = 0;
  private scrollLeft = 0;
  loading: boolean = false;
  skipAlert: boolean = false;

  expandedRows: { [eiin: string]: boolean } = {};
  expandedRows2: { [eiin: string]: boolean } = {};
  freeUnlockLimit = 100;
  unlockedEIINs: Set<string> = new Set();
  token: string | null = null;
  tokenCounter: number = 0;
  eiinLoading: Set<string> = new Set();

  startScroll(event: MouseEvent): void {
    this.isDown = true;
    this.startX = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    this.scrollLeft = this.scrollContainer.nativeElement.scrollLeft;
  }

  stopScroll(): void {
    this.isDown = false;
  }

  onScroll(event: MouseEvent): void {
    if (!this.isDown) return;

    event.preventDefault();
    const x = event.pageX - this.scrollContainer.nativeElement.offsetLeft;
    const walk = (x - this.startX) * 1.2; // speed multiplier
    this.scrollContainer.nativeElement.scrollLeft = this.scrollLeft - walk;
  }
  showNoDataAlert: boolean = false;
  showNoDataAlert2: boolean = false;
  showNoDataAlert3: boolean = false;
  showNoDataAlert4: boolean = false;
  showNoDataAlert5: boolean = false;
  showNoDataAlert6: boolean = false;
  showNoDataAlert7: boolean = false;
  showNoDataAlert8: boolean = false;

  designationToSubjects: { [key: string]: string[] } = {
    "Assistant Instructor": [
      "Physical Exercise"
    ],
    "Assistant Moulavi": [
      "Assistant Moulavi"
    ],
    "Assistant Moulavi (Qari)": [
      "Tajbid"
    ],
    "Assistant Teacher": [
      "Agricultural Education",
      "Agriculture",
      "Arts and Crafts",
      "Bengali",
      "Biology",
      "Business Studies",
      "English",
      "Home Economics",
      "Information and Communication Technology",
      "Library and Information Science",
      "Mathematics",
      "Physical Education",
      "Physical Exercise",
      "Social Science"
    ],
    "Assistant Teacher(Chemistry)": [
      "Chemistry"
    ],
    "Assistant Teacher(Physics)": [
      "Physics"
    ],
    "Assistant Teacher(Religion and Moral Education)": [
      "Buddhism",
      "Christianity",
      "Hinduism",
      "Islam"
    ],
    "Assistant Teacher, Chemistry": [
      "Chemistry"
    ],
    "Assistant Teacher, Physical Science": [
      "Physics/Chemistry"
    ],
    "Assistant Teacher, Physics": [
      "Physics"
    ],
    "Assistant Teacher/Physical Exercise Teacher": [
      "Physical Education",
      "Physical Education & Sports"
    ],
    "Computer Demonstrator": [
      "Computer Science"
    ],
    "Demonstrator": [
      "Botany/Zoology",
      "Chemistry",
      "Information and Communication Technology",
      "Physics"
    ],
    "Ebtedayee Moulavi": [
      "Quran & Tajbid/Fhikah & Arabic"
    ],
    "Ebtedayee Qari": [
      "Quran & Tajbid/Fhikah & Arabic"
    ],
    "Ebtedayee Teacher": [
      "Language (Bengali & English)"
    ],
    "Instructor (Non Tech)": [
      "Bengali",
      "Chemistry",
      "English",
      "Management",
      "Physics"
    ],
    "Instructor (Non-Tech)": [
      "Mathematics,Parameter & Statistics"
    ],
    "Instructor (Tech)": [
      "Agricultural Engineering",
      "Agriculture",
      "Animal Treartment and Production",
      "Fisheries"
    ],
    "Lecturer": [
      "Accounting",
      "Adab",
      "Agriculture",
      "Arabic",
      "Art History",
      "Banking",
      "Bengali",
      "Botany",
      "Ceramic",
      "Chemistry",
      "Commercial Art and Computer Graphics",
      "Computer Operation",
      "Crafts",
      "Drawing and Painting",
      "Economics",
      "English",
      "Entrepreneur Development",
      "Finance",
      "Finance, Banking and Insurance",
      "Fiqh",
      "Geography and Environment",
      "Hadith",
      "History",
      "Home Economics",
      "Information and Communication Technology",
      "Islamic History",
      "Islamic History and Culture",
      "Islamic Studies",
      "Library and Information Science",
      "Management",
      "Marketing",
      "Mathematics",
      "Oriental Art",
      "Pali",
      "Philosophy",
      "Physics",
      "Political Science",
      "Print Making",
      "Production Management and Marketing",
      "Psychology",
      "Sanskrit",
      "Sculpture",
      "Social Welfare/Social Work",
      "Social Works/ Social Welfare",
      "Sociology",
      "Soil Science",
      "Statistics",
      "Tafsir",
      "Zoology"
    ],
    "Lecturer, Biology": [
      "Zoology"
    ],
    "Library Lecturer": [
      "Library and Information Science"
    ],
    "Trade Instructor": [
      "Agro Based Food",
      "Architectural Drafting with CAD",
      "Automotive",
      "Building Maintenance/Civil Construction",
      "Computer & Information Technology",
      "Dress Making",
      "Farm Machinery",
      "Fish Culture & Breeding/Shrimp Culture & Breeding",
      "Flower, Fruit & Vegetable Cultivation",
      "Food Processing",
      "Food Processing & Preservation",
      "General Electrical Works",
      "General Electrical Works/Electrical Maintenance Works",
      "General Electronics",
      "General Mechanics",
      "Information and Communication Technology",
      "Patient Care Technique",
      "Plumbing and Pipe Fitting",
      "Poultry Rearing & Farming",
      "Refrigeration & Air Conditioning",
      "Refrigeration and Air Conditioning",
      "Welding & Fabrication",
      "Welding and Fabrication"
    ]
  }
  subjects: string[] = [];

  designations: string[] = ['Assistant Instructor', 'Assistant Moulavi', 'Assistant Moulavi (Qari)',
    'Assistant Teacher', 'Assistant Teacher(Chemistry)', 'Assistant Teacher(Physics)', 'Assistant Teacher(Religion and Moral Education)',
    'Assistant Teacher, Chemistry', 'Assistant Teacher, Physical Science', 'Assistant Teacher, Physics', 'Assistant Teacher/Physical Exercise Teacher', 'Computer Demonstrator', 'Demonstrator',
    'Ebtedayee Moulavi', 'Ebtedayee Qari', 'Ebtedayee Teacher', 'Instructor (Non Tech)', 'Instructor (Non-Tech)', 'Instructor (Tech)', 'Lecturer', 'Lecturer, Biology',
    'Library Lecturer', 'Trade Instructor'];

  districts: string[] = ['BAGERHAT', 'BANDARBAN', 'BARGUNA', 'BARISAL', 'BHOLA', 'BOGRA', 'BRAHMANBARIA', 'CHANDPUR', 'CHAPAI NAWABGANJ', 'CHITTAGONG', 'CHUADANGA', 'COMILLA',
    'COX`S BAZAR', 'DHAKA', 'DINAJPUR', 'FARIDPUR', 'FENI', 'GAIBANDHA', 'GAZIPUR', 'GOPALGANJ', 'HABIGANJ', 'JAMALPUR', 'JESSORE', 'JHALOKATHI', 'JHENAIDAH', 'JOYPURHAT', 'KHAGRACHHARI',
    'KHULNA', 'KISHOREGANJ', 'KURIGRAM', 'KUSHTIA', 'LAKSHMIPUR', 'LALMONIRHAT', 'MADARIPUR', 'MAGURA', 'MANIKGANJ', 'MEHERPUR', 'MOULVIBAZAR', 'MUNSHIGANJ', 'MYMENSINGH', 'NAOGAON', 'NARAIL',
    'NARAYANGANJ', 'NARSINGDI', 'NATORE', 'NETROKONA', 'NILPHAMARI', 'NOAKHALI', 'PABNA', 'PANCHAGARH', 'PATUAKHALI', 'PIROJPUR', 'RAJBARI', 'RAJSHAHI', 'RANGAMATI', 'RANGPUR', 'SATKHIRA',
    'SHARIATPUR', 'SHERPUR', 'SIRAJGANJ', 'SUNAMGANJ', 'SYLHET', 'TANGAIL', 'THAKURGAON'];
  selectedSubject: string = '';
  selectedDesignation: string = '';
  selectedDistricts: string[] = [];
  vacancies: any[] = [];
  totalCount: number = 0; // Total number of records
  currentPage: number = 1; // Current page number
  totalPages: number = 1;
  pageSize: number = 100;
  tableRows: string[][] = [];
  maxDistrictSelection: number = 65;
  youtube: string[] = [
    'https://www.youtube.com/embed/fYrfZvcp7xc',
    // 'https://www.youtube.com/embed/fYrfZvcp7xc'
    // Add more embed URLs here
  ];

  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    const deviceWidth = window.innerWidth;
    let columns = 12; // default

    if (deviceWidth <= 375) {
      columns = 1;
    } else if (deviceWidth <= 430) {
      columns = 2;                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               
    } else if (deviceWidth <= 768) {
      columns = 4;
    } else if (deviceWidth <= 1024) {
      columns = 6;
    } else if (deviceWidth <= 1366) {
      columns = 8;
    } else {
      columns = 10;
    }
    this.tableRows = this.createTableRows(this.districts, columns);
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });

    const unlocked = localStorage.getItem('unlockedEIINs');
      if (unlocked) {
        this.unlockedEIINs = new Set(JSON.parse(unlocked));

        // Auto-fetch data for already unlocked EIINs
        for (const eiin of this.unlockedEIINs) {
          const vacancy = this.vacancies.find(v => v.EIIN === eiin);
          if (vacancy) {
            const url = `${this.baseUrl2}?eiin=${eiin}&ts=${Date.now()}`;
            this.http.get<any>(url).subscribe({
              next: (res) => {
                vacancy.parameter = res;
              },
              error: (err) => {
                console.warn(`Failed to re-fetch data for EIIN ${eiin}`, err);
              }
            });
          }
        }
      }

      this.token = localStorage.getItem('unlockToken');
      this.tokenCounter = Number(localStorage.getItem('tokenCounter')) || 0;
    }

  createTableRows(districts: string[], columns: number): string[][] {
    const rows = [];
    for (let i = 0; i < districts.length; i += columns) {
      rows.push(districts.slice(i, i + columns));
    }
    return rows;
  }

  onSubmit(): void {
    this.currentPage = 1;
    this.loading = true;
    this.getVacancies(this.currentPage);
  }

  getVacancies(page: number): void {
    let params = new HttpParams()
      .set('designation', this.selectedDesignation)
      .set('subject', this.selectedSubject)
      .set('page', page.toString());

    this.selectedDistricts.forEach(district => {
      params = params.append('district', district);
    });

    this.http.get(`${this.baseUrl}`, { params }).subscribe((data: any) => {
      if (!this.selectedSubject || !this.selectedDesignation || this.selectedDistricts.length === 0) {
        this.vacancies = [];
        this.showNoDataAlert = false;
        setTimeout(() => this.showNoDataAlert = true);
        this.loading = false;
        return;
      }

      this.vacancies = data.results;

      const fetchRequests = this.vacancies.map((vacancy) => {
        if (this.unlockedEIINs.has(vacancy.EIIN)) {
          const url = `${this.baseUrl2}?eiin=${vacancy.EIIN}&ts=${Date.now()}`;
          return this.http.get(url).toPromise()
            .then(res => {
              vacancy.parameter = res;
            })
            .catch(err => {
              console.warn(`Failed to load unlocked EIIN: ${vacancy.EIIN}`, err);
              vacancy.parameter = null;
            });
        } else {
          vacancy.parameter = null;
          return Promise.resolve();
        }
      });

      Promise.all(fetchRequests).then(() => {
        // sort vacancies
        this.vacancies.sort((a, b) => {
          const distA = (a.District || '').toUpperCase();
          const distB = (b.District || '').toUpperCase();
          const cmp = distA.localeCompare(distB);
          if (cmp !== 0) return cmp;

          const thanaA = (a.Thana || '').toUpperCase();
          const thanaB = (b.Thana || '').toUpperCase();
          return thanaA.localeCompare(thanaB);
        });

        this.totalCount = data.count;
        this.totalPages = Math.ceil(this.totalCount / this.pageSize);
        const startRecord = (this.currentPage - 1) * this.pageSize + 1;
        const endRecord = Math.min(this.currentPage * this.pageSize, this.totalCount);
        this.recordRange = `Displaying <b>${startRecord}-${endRecord}</b> records of <b>${this.totalCount}</b> of total 100822 Records!`;

        setTimeout(() => {
          const el = this.scrollContainer?.nativeElement;
          if (el) {
            const topOffset = el.getBoundingClientRect().top + window.scrollY - 220;
            window.scrollTo({ top: topOffset, behavior: 'smooth' });
          }
        }, 700);

        this.loading = false;
      });
    });
  }


  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.getVacancies(this.currentPage);
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getVacancies(this.currentPage);
    }
  }
  onDistrictSelectionChange(district: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const isChecked = input.checked;

    if (isChecked) {
      if (this.selectedDistricts.length < this.maxDistrictSelection) {
        this.selectedDistricts.push(district);
      } else {
        if (!this.skipAlert) {
          this.showNoDataAlert3 = false;
          setTimeout(() => {
            this.showNoDataAlert3 = true;
          });
        }
        input.checked = false;
      }
    } else {
      const index = this.selectedDistricts.indexOf(district);
      if (index > -1) {
        this.selectedDistricts.splice(index, 1);
      }
    }
  }

  parseJSON(data: any): any[] {
    try {
      if (!data || typeof data !== 'string') {
        return [];
      }

      let sanitized = data.trim().replace(/\n/g, '');

      sanitized = sanitized.replace(/'/g, '"');

      if (!sanitized.trim().startsWith('[')) {
        return [];
      }

      sanitized = sanitized.replace(/\(/g, '[').replace(/\)/g, ']');

      return JSON.parse(sanitized);
    } catch (e) {
      console.error('JSON parsing failed:', data, e);
      return [];
    }
  }

  onDesignationChange(): void {
    this.subjects = this.designationToSubjects[this.selectedDesignation] || [];
    this.selectedSubject = ''; // reset selected subject
  }

  getVisibleRows(vacancy: any): any[] {
    const data = this.parseJSON(vacancy?.parameter?.results?.[0]?.Record2);
    const eiin = vacancy?.EIIN;

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return this.expandedRows[eiin] ? data : data.slice(0, 2);
  }

  toggleExpand(eiin: string): void {
    this.expandedRows[eiin] = !this.expandedRows[eiin];
  }
  getVisibleRows2(vacancy: any): string[] {
    const contactStr = vacancy?.parameter?.results?.[0]?.Contact;
    const eiin = vacancy?.EIIN;

    if (typeof contactStr !== 'string') return [];

    const data = contactStr.split(',').map(item => item.trim()).filter(Boolean); // filter empty values

    return this.expandedRows2[eiin] ? data : data.slice(0, 2);
  }


  toggleExpand2(eiin: string): void {
    this.expandedRows2[eiin] = !this.expandedRows2[eiin];
  }

  toggleAllDistricts(): void {
    this.skipAlert = true;
    if (this.selectedDistricts.length === this.districts.length) {
      this.selectedDistricts = [];
    } else {
      this.selectedDistricts = [...this.districts];
    }
    setTimeout(() => {
      this.skipAlert = false;
    });
  }

  isEIINUnlocked(eiin: string): boolean {
    return this.unlockedEIINs.has(eiin);
  }

  // unlockEIIN(eiin: string): void {
  //   if (this.unlockedEIINs.has(eiin)) return;

  //   const vacancy = this.vacancies.find(v => v.EIIN === eiin);
  //   if (!vacancy) return;

  //   const processUnlock = () => {
  //     this.addUnlockedEIIN(eiin);

  //     // Fetch baseUrl2 data and assign to vacancy
  //     const url = `${this.baseUrl2}?eiin=${eiin}&ts=${Date.now()}`;
  //     this.http.get<any>(url).subscribe({
  //       next: (res) => {
  //         vacancy.parameter = res;
  //       },
  //       error: (err) => {
  //         console.error(`Error fetching baseUrl2 for EIIN ${eiin}:`, err);
  //         vacancy.parameter = null;
  //       }
  //     });
  //   };

  //   // Free unlocks
  //   if (this.unlockedEIINs.size < this.freeUnlockLimit) {
  //     processUnlock();
  //     return;
  //   }

  //   // Token required
  //   if (!this.token || this.tokenCounter <= 0) {
  //     this.showNoDataAlert4 = false;
  //     setTimeout(() => this.showNoDataAlert4 = true);
  //     return;
  //   }

  //   // Token API call
  //   this.http.post<any>('https://cheradip.com/api/token', {
  //     token: this.token,
  //     eiin: eiin
  //   }).subscribe({
  //     next: (res) => {
  //       if (res.success && res.remaining > 0) {
  //         this.tokenCounter = res.remaining;
  //         localStorage.setItem('tokenCounter', this.tokenCounter.toString());
  //         processUnlock();
  //       } else {
  //         this.tokenCounter = 0;
  //         localStorage.setItem('tokenCounter', '0');
  //         this.showNoDataAlert5 = false;
  //         setTimeout(() => this.showNoDataAlert5 = true);
  //       }
  //     },
  //     error: () => {
  //       this.showNoDataAlert6 = false;
  //       setTimeout(() => this.showNoDataAlert6 = true);
  //     }
  //   });
  // }
  unlockEIIN(eiin: string): void {
    if (this.unlockedEIINs.has(eiin)) return;

    const vacancy = this.vacancies.find(v => v.EIIN === eiin);
    if (!vacancy) return;

    this.eiinLoading.add(eiin); // show loader

    const fetchAndUnlock = () => {
      const url = `${this.baseUrl2}?eiin=${eiin}&ts=${Date.now()}`;
      this.http.get<any>(url).subscribe({
        next: (res) => {
          vacancy.parameter = res;

          // Only unlock if request was successful
          this.addUnlockedEIIN(eiin);
          this.eiinLoading.delete(eiin);
        },
        error: (err) => {
          console.error(`EIIN fetch failed: ${eiin}`, err);
          this.showNoDataAlert6 = false;
          setTimeout(() => this.showNoDataAlert6 = true); // connection error message
          this.eiinLoading.delete(eiin);
        }
      });
    };

    if (this.unlockedEIINs.size < this.freeUnlockLimit) {
      fetchAndUnlock(); // free unlock
      return;
    }

    if (!this.token || this.tokenCounter <= 0) {
      this.showNoDataAlert4 = false;
      setTimeout(() => this.showNoDataAlert4 = true); // token empty
      this.eiinLoading.delete(eiin);
      return;
    }

    // Use token
    this.http.post<any>(`${environment.apiUrl}/token`, { token: this.token, eiin }).subscribe({
      next: (res) => {
        if (res.success && res.remaining > 0) {
          this.tokenCounter = res.remaining;
          localStorage.setItem('tokenCounter', this.tokenCounter.toString());
          fetchAndUnlock();
        } else {
          this.tokenCounter = 0;
          localStorage.setItem('tokenCounter', '0');
          this.showNoDataAlert5 = false;
          setTimeout(() => this.showNoDataAlert5 = true);
          this.eiinLoading.delete(eiin);
        }
      },
      error: () => {
        this.showNoDataAlert6 = false;
        setTimeout(() => this.showNoDataAlert6 = true); // token connection error
        this.eiinLoading.delete(eiin);
      }
    });
  }

  fetchInstituteData(eiin: string): void {
    const match = this.vacancies.find(v => v.EIIN === eiin);

    // Skip if not found or already fetched
    if (!match || match.parameter) return;

    const url = `${this.baseUrl2}?eiin=${eiin}&ts=${Date.now()}`;
    this.http.get<any>(url).subscribe({
      next: (res) => {
        match.parameter = res;
      },
      error: (err) => {
        console.error(`Failed to fetch institute data for EIIN ${eiin}`, err);
        match.parameter = null; // Optional: set to null on error
      }
    });
  }

  addUnlockedEIIN(eiin: string): void {
    this.unlockedEIINs.add(eiin);
    localStorage.setItem('unlockedEIINs', JSON.stringify(Array.from(this.unlockedEIINs)));
  }

  verifyToken(): void {
    const trimmed = (this.token || '').trim();
    if (!trimmed || trimmed.length < 8 || trimmed.length > 10) {
      this.showNoDataAlert7 = false;
      setTimeout(() => {
        this.showNoDataAlert7 = true;
      });
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/token?token=${encodeURIComponent(trimmed)}`).subscribe({
      next: (res) => {
        if (res.success && res.counter > 0) {
          this.tokenCounter = res.counter;
          localStorage.setItem('unlockToken', trimmed);
          localStorage.setItem('tokenCounter', this.tokenCounter.toString());
          this.showNoDataAlert8 = false;
          setTimeout(() => {
            this.showNoDataAlert8 = true;
          });
        } else {
          this.showNoDataAlert6 = false;
          setTimeout(() => {
            this.showNoDataAlert6 = true;
          });
        }
      },
      error: () => {
        this.showNoDataAlert6 = false;
        setTimeout(() => {
          this.showNoDataAlert6 = true;
        });
      }
    });
  }

  // Record Range Display
  recordRange: string = '';

}
