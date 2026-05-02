import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingService } from 'src/app/service/loading.service';
import { TrxUnlockService } from 'src/app/service/trx-unlock.service';

@Component({
  selector: 'app-merit7',
  templateUrl: './merit7.component.html',
  styleUrls: ['./merit7.component.css']
})

export class Merit7Component implements OnInit, AfterViewInit {
  baseUrl: string = `${environment.apiUrl}/merit7/`
  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;
  private isDown = false;
  private startX = 0;
  private scrollLeft = 0;
  loading: boolean = false;
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
  showNoDataAlert9: boolean = false;
  showNoDataAlert10: boolean = false;
  showNoDataAlert11: boolean = false;
  showNoDataAlert12: boolean = false;
  isGeneratingPdf: boolean = false;
  isGeneratingPdf2: boolean = false;
  newToken: string = '';

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

  designations: string[] = ['201','202','203','204','205','206','207','208','209','210','211','212','213','214','215','216','217','218','219','220','221','222','223','224','225','226','227','228','229','284','288','289','290','291','292','295','296','298',
'301','302','303','304','305','306','307','308','309','310','311','312','313','314','315','316','317','318','319','320','321','322','323','324','325','326','327','328','330','331','332','333',
'401','402','403','404','405','406','407','408','409','410','411','412','413','414','415','416','417','418','419','420','421','422','423','424','425','426','427','428','429','430','431','432','433','434','435','437','438','439','440','441','442','444','445','446','447','448','449','451','452','453','454','455','456','457','458','459','460','461','462','463','464','465','466','467','495','496','498','499'
];

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
  totalRecordsInDb: number = 0;
  currentPage: number = 1; // Current page number
  totalPages: number = 1;
  pageSize: number = 100;
  tableRows: string[][] = [];
  maxDistrictSelection: number = 16;
  trxRemaining = 0;
  unlockedEIINs: Set<string> = new Set();
  eiinLoading: Set<string> = new Set();
  selectedEIINs: Set<string> = new Set();
  youtube: string[] = [
    'https://www.youtube.com/embed/P-ZuTjaMhJA',
    'https://www.youtube.com/embed/fYrfZvcp7xc',
    // Add more embed URLs here
  ];

  constructor(
    private http: HttpClient,
    private renderer: Renderer2,
    private loadingService: LoadingService,
    private trxUnlock: TrxUnlockService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.getTotalTableCount();
    const selected = localStorage.getItem('selectedEIINs');
    if (selected) this.selectedEIINs = new Set(JSON.parse(selected));
    const unlockedEIINs = localStorage.getItem('unlockedEIINs');
    if (unlockedEIINs) this.unlockedEIINs = new Set(JSON.parse(unlockedEIINs));
    this.trxRemaining = this.trxUnlock.getCachedRemaining();

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
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  applyToken(): void {
    const trimmedToken = (this.newToken || '').trim();
    if (!trimmedToken || trimmedToken.length < 8 || trimmedToken.length > 10) {
      this.showNoDataAlert7 = false;
      setTimeout(() => this.showNoDataAlert7 = true);
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/token/?token=${encodeURIComponent(trimmedToken)}`).subscribe({
      next: (res) => {
        const result = res?.results?.[0];
        console.log(result);

        if (result && result.Counter != null && Number(result.Status) === 0) {
          this.trxUnlock.activateAppliedTrx({ id: result.id }).subscribe({
            next: (rem) => {
              this.trxRemaining = rem;
              this.newToken = '';
              this.showNoDataAlert8 = false;
              setTimeout(() => this.showNoDataAlert8 = true);
            },
            error: () => {
              this.showNoDataAlert6 = false;
              setTimeout(() => this.showNoDataAlert6 = true);
            }
          });
        } else {
          this.showNoDataAlert11 = false;
          setTimeout(() => this.showNoDataAlert11 = true);
        }
      },
      error: () => {
        this.showNoDataAlert6 = false;
        setTimeout(() => this.showNoDataAlert6 = true);
      }
    });
  }

  createTableRows(districts: string[], columns: number): string[][] {
    const rows = [];
    for (let i = 0; i < districts.length; i += columns) {
      rows.push(districts.slice(i, i + columns));
    }
    return rows;
  }

  getTotalTableCount() {
    this.http.get<{ count: number }>(`${this.baseUrl}total_table_count/`)
      .subscribe(res => this.totalRecordsInDb = res.count ?? 0);
  }

  onSubmit(): void {
    this.currentPage = 1;
    this.loading = true;
    this.getVacancies(this.currentPage);
  }

  getVacancies(page: number): void {
    let params = new HttpParams()
      .set('code', this.selectedDesignation)
      .set('page', page.toString());
    this.loading = true;

    this.http.get(`${this.baseUrl}`, { params }).subscribe((data: any) => {
      if (data.count === 0) {
        this.vacancies = [];
        this.showNoDataAlert2 = true;
        this.loading = false;
      } else {
        this.vacancies = data.results;

        // Sorting the vacancies by 'SL' in descending order (numerically)
        this.vacancies.sort((a, b) => {
          // Ensure SL is treated as a number and sort in descending order
          const slA = typeof a.SL === 'number' ? a.SL : Number(a.SL);
          const slB = typeof b.SL === 'number' ? b.SL : Number(b.SL);

          return slA - slB; // Descending order
        });

        this.totalCount = data.count; // Total number of records
        this.totalPages = Math.ceil(this.totalCount / this.pageSize); // Calculate total pages

        // Calculate the range of records to display
        const startRecord = (this.currentPage - 1) * this.pageSize + 1;
        const endRecord = Math.min(this.currentPage * this.pageSize, this.totalCount);
        this.recordRange = `Displaying <b>${startRecord}-${endRecord}</b> records of <b>${this.totalCount}</b> of total ${this.totalRecordsInDb.toLocaleString()} Records!`;
        setTimeout(() => {
          if (this.scrollContainer?.nativeElement) {
            const element = this.scrollContainer.nativeElement;
            const topOffset = element.getBoundingClientRect().top + window.scrollY - 220;
            window.scrollTo({ top: topOffset, behavior: 'smooth' });
          }
          this.loading = false;
        }, 300);
      }
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
  // Record Range Display
  recordRange: string = '';

}
