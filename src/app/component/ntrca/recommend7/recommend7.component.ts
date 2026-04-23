import { Component, OnInit, AfterViewInit, OnDestroy, Renderer2, ElementRef, ViewChild, HostListener } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-recommend7',
  templateUrl: './recommend7.component.html',
  styleUrls: ['./recommend7.component.css']
})

export class Recommend7Component implements OnInit, AfterViewInit, OnDestroy {
  baseUrl: string = `${environment.apiUrl}/recommend7/`
  baseUrl2: string = `${environment.apiUrl}/banbeis/`
  @ViewChild('scrollContainer', { static: true }) scrollContainer!: ElementRef;
  private isDown = false;
  private startX = 0;
  private scrollLeft = 0;
  loading: boolean = false;
  skipAlert: boolean = false;
  newToken: string = '';

  districtDropdownOpen = false;
  thanaDropdownOpen = false;
  private dropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private dropdownLeaveKind: 'district' | 'thana' | null = null;

  expandedRows: { [eiin: string]: boolean } = {};
  expandedRows2: { [eiin: string]: boolean } = {};
  freeUnlockLimit = 10;
  unlockedEIINs: Set<string> = new Set();
  eiinLoading: Set<string> = new Set();
  selectedEIINs: Set<string> = new Set();
  allSelectedVacancies = new Map<string, any>();

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
    const walk = (x - this.startX) * 1.2;
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

  designations: string[] = ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223', '224', '228', '284', '288', '289',
    '290', '291', '292', '295', '296', '298', '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '322', '323', '324', '325',
    '326', '327', '328', '329', '330', '401', '402', '403', '404', '405', '406', '407', '408', '409', '410', '411', '412', '413', '414', '415', '416', '417', '418', '419', '420', '421', '422', '423', '424', '425', '426', '427', '428',
    '429', '430', '431', '432', '433', '434', '435', '437', '438', '439', '440', '441', '442', '444', '445', '446', '447', '448', '449', '451', '452', '453', '454', '455', '456', '457', '458', '495', '496', '499', ''
  ];

  districts: string[] = [];
  selectedSubject: string = '';
  selectedDesignation: string = '';
  selectedDistricts: string[] = [];
  thanas: string[] = [];
  selectedThanas: string[] = [];
  vacancies: any[] = [];
  totalCount: number = 0;
  /** Total rows in table (no filter), for "of total X Records!" */
  totalRecordsInDb: number = 0;
  currentPage: number = 1;
  totalPages: number = 1;
  pageSize: number = 100;
  tableRows: string[][] = [];
  maxDistrictSelection: number = 65;
  youtube: string[] = [
    'https://www.youtube.com/embed/P-ZuTjaMhJA',
    'https://www.youtube.com/embed/fYrfZvcp7xc',
    // Add more embed URLs here
  ];

  get currentYear(): number { return new Date().getFullYear(); }
  get yearMinus1(): number { return this.currentYear - 1; }
  get yearMinus2(): number { return this.currentYear - 2; }
  get yearMinus3(): number { return this.currentYear - 3; }
  get yearMinus4(): number { return this.currentYear - 4; }

  constructor(
    private http: HttpClient,
    private renderer: Renderer2,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.getDistricts();
    this.getTotalTableCount();

    const selected = localStorage.getItem('selectedEIINs');
    if (selected) this.selectedEIINs = new Set(JSON.parse(selected));
    const unlockedEIINs = localStorage.getItem('unlockedEIINs');
    if (unlockedEIINs) this.unlockedEIINs = new Set(JSON.parse(unlockedEIINs));
    const stored = localStorage.getItem('freeUnlockLimit');
    this.freeUnlockLimit = Number(stored) || 10;

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

  getDistricts() {
    let params = new HttpParams();
    if (this.selectedDesignation) {
      params = params.set('code', this.selectedDesignation);
    }
    this.http.get<string[]>(`${this.baseUrl}unique_districts/`, { params })
      .subscribe(res => this.districts = res);
  }

  getTotalTableCount() {
    this.http.get<{ count: number }>(`${this.baseUrl}total_table_count/`)
      .subscribe(res => this.totalRecordsInDb = res.count ?? 0);
  }

  onSubjectCodeChange() {
    this.selectedDistricts = [];
    this.selectedThanas = [];
    this.thanas = [];
    this.getDistricts();
  }

  onDistrictChange(district: string, event: any) {
    if (event.target.checked) {
      this.selectedDistricts.push(district);
    } else {
      this.selectedDistricts = this.selectedDistricts.filter(d => d !== district);
    }
    this.loadThanas();
  }

  loadThanas() {
    if (this.selectedDistricts.length === 0) {
      this.thanas = [];
      return;
    }

    let params = new HttpParams();
    if (this.selectedDesignation) {
      params = params.set('code', this.selectedDesignation);
    }
    this.selectedDistricts.forEach(d => {
      params = params.append('district', d);
    });

    this.http.get<string[]>(`${this.baseUrl}unique_thanas/`, { params })
      .subscribe(res => this.thanas = res);
  }

  onThanaChange(thana: string, event: any) {
    if (event.target.checked) {
      this.selectedThanas.push(thana);
    } else {
      this.selectedThanas = this.selectedThanas.filter(t => t !== thana);
    }
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
      .set('code', this.selectedDesignation || 201)
      .set('page', page.toString());

    this.selectedDistricts.forEach(d => {
      params = params.append('district', d);
    });

    this.selectedThanas.forEach(t => {
      params = params.append('thana', t);
    });

    this.loading = true;

    this.http.get(`${this.baseUrl}`, { params }).subscribe((data: any) => {
      if (data.count === 0) {
        this.vacancies = [];
        this.showNoDataAlert2 = true;
        this.selectedDistricts = [];
        this.selectedThanas = [];
        this.loading = false;
      } else {
        this.vacancies = data.results;

        this.totalCount = data.count;
        this.totalPages = Math.ceil(this.totalCount / this.pageSize);
        const startRecord = (this.currentPage - 1) * this.pageSize + 1;
        const endRecord = Math.min(this.currentPage * this.pageSize, this.totalCount);
        this.recordRange = `Displaying <b>${startRecord}-${endRecord}</b> records of <b>${this.totalCount}</b> of total ${this.totalRecordsInDb.toLocaleString()} Records!`;

        setTimeout(() => {
          const el = this.scrollContainer?.nativeElement;
          if (el) {
            const topOffset = el.getBoundingClientRect().top + window.scrollY - 220;
            window.scrollTo({ top: topOffset, behavior: 'smooth' });
          }
          this.loading = false;
          this.selectedDistricts = [];
          this.selectedThanas = [];
        }, 700);


        // ✅ Refresh unlocked EIINs after vacancies are ready
        const unlocked = localStorage.getItem('unlockedEIINs');
        if (unlocked) {
          this.unlockedEIINs = new Set(JSON.parse(unlocked));
          for (const eiin of this.unlockedEIINs) {
            const vacancy = this.vacancies.find(v => v.EIIN === eiin);
            if (vacancy) {
              const url = `${this.baseUrl2}?eiin=${eiin}`;
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

        this.loading = false;
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

  getInstituteNameLines(name: string | null | undefined): { line1: string; line2: string; line3: string } {
    const raw = (name || '').replace(/\s+/g, ' ').trim();
    if (!raw) return { line1: 'N/A', line2: '', line3: '' };
    if (raw.length <= 24) return { line1: raw, line2: '', line3: '' };
    const spaceBefore24 = raw.lastIndexOf(' ', 24);
    if (spaceBefore24 <= 0) return { line1: raw, line2: '', line3: '' };
    let line1 = raw.substring(0, spaceBefore24).trim();
    let line2 = raw.substring(spaceBefore24).trim();
    let line3 = '';
    if (line2.length > 24) {
      const spaceBefore24L2 = line2.lastIndexOf(' ', 24);
      if (spaceBefore24L2 > 0) {
        line3 = line2.substring(spaceBefore24L2).trim();
        line2 = line2.substring(0, spaceBefore24L2).trim();
      }
    }
    return { line1, line2, line3 };
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

  unlockEIIN(eiin: string): void {
    if (this.unlockedEIINs.has(eiin)) return;

    const vacancy = this.vacancies.find(v => v.EIIN === eiin);
    if (!vacancy) return;

    this.eiinLoading.add(eiin); // show loader

    const fetchAndUnlock = () => {
      const url = `${this.baseUrl2}?eiin=${eiin}`;
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

    if (this.unlockedEIINs.size <= this.freeUnlockLimit) {
      fetchAndUnlock(); // free unlock
      this.loading = false;
      return;
    }

    else {
      this.loading = false;
      this.showNoDataAlert4 = false;
      setTimeout(() => this.showNoDataAlert4 = true);
      return;
    }
  }

  addUnlockedEIIN(eiin: string): void {
    this.unlockedEIINs.add(eiin);
    localStorage.setItem('unlockedEIINs', JSON.stringify(Array.from(this.unlockedEIINs)));
  }

  toggleSelection(eiin: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const vacancy = this.vacancies.find(v => v.EIIN === eiin);
    if (checked) {
      this.selectedEIINs.add(eiin);
      if (vacancy) {
        this.allSelectedVacancies.set(eiin, vacancy);
      }
    } else {
      this.selectedEIINs.delete(eiin);
      this.allSelectedVacancies.delete(eiin);
    }
  }

  toggleSelectAll(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.checked) {
      for (const vacancy of this.vacancies) {
        this.selectedEIINs.add(vacancy.EIIN);
        this.allSelectedVacancies.set(vacancy.EIIN, vacancy);
      }
    } else {
      for (const vacancy of this.vacancies) {
        this.selectedEIINs.delete(vacancy.EIIN);
        this.allSelectedVacancies.delete(vacancy.EIIN);
      }
    }
  }


  buildPrintTable(rows: any[]): string {
    const headers = `
      <tr>
        <th>SL</th>
        <th>EIIN<br>Institute Name</th>
        <th>District - Thana/Upz - Union<br>Mouza - Ward No</th>
        <th>Designation<br>Post</th>
        <th>Total Students<br>${this.yearMinus1}</th>
        <th>Classwise Students<br>${this.yearMinus1}</th>
      </tr>
    `;

    const body = rows.map((v, idx) => {
      const sl = idx + 1;
      const record = this.parseJSON(v.parameter?.results?.[0]?.Record);
      const record2 = this.parseJSON(v.parameter?.results?.[0]?.Record2);

      const locationHTML = record?.map(row =>
        `<tr>${row.map((cell: string) => `<td>${cell === 'কোনোটিই নয়' ? '' : cell}</td>`).join('')}</tr>`
      ).join('') || '';

      const postHTML = record2?.map(row =>
        `<tr>${row.map((cell: string) => `<td>${cell === 'কোনোটিই নয়' ? '' : cell}</td>`).join('')}</tr>`
      ).join('') || '';

      return `
        <tr>
          <td>${sl}</td>
          <td>${v.EIIN}<br>${v.Name}</td>
          <td><table class="inner-table">${locationHTML}</table></td>
          <td><table class="inner-table">${postHTML}</table></td>
          <td>${v.TotalStudents || ''}</td>
          <td>${v.ClasswiseStudents || ''}</td>
        </tr>
      `;
    }).join('');

    return `
      <table>
        <thead>${headers}</thead>
        <tbody>${body}</tbody>
      </table>
    `;
  }

  printSelected(): void {
    const selectedVacancies = Array.from(this.allSelectedVacancies.values());

    if (selectedVacancies.length === 0) {
      this.showNoDataAlert9 = false;
      setTimeout(() => this.showNoDataAlert9 = true);
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>Print Selected Vacancies</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              font-size: 12px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              page-break-inside: avoid;
            }
            th, td {
              border: 1px solid #333;
              padding: 6px;
              vertical-align: top;
              text-align: left;
            }
            h1.diagonal-watermark {
              z-index: 999; 
              opacity: 1;
              font-weight: 700;
              font-size: 164px;
              display: flex;
              justify-content: center;
              align-items: center;
              white-space: nowrap;
              text-shadow: 1px 1px 3px rgba(0, 128, 128, 0.25);
              font-family: 'Segoe UI Black', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              transform: rotate(-45deg); 
              color: transparent;
              -webkit-text-stroke: 1px teal;
              -webkit-text-fill-color: transparent;
              position: absolute;
              top: 20%;
              left: 25%;
              transform-origin: center center;
              pointer-events: none;
            }
            .fb-watermark {
              margin-top: 1400px;
            }
            @media print {
              @page {
                size: landscape;
              }
            }
          </style>
        </head>
        <body>
          <h1 class="diagonal-watermark">cheradip.com</h1>
          <h1 class="diagonal-watermark fb-watermark">fb: p.cheradip</h1>
          <table>
            <thead>
              <tr>
                <th>SL</th>
                <th>EIIN<br>Institute Name</th>
                <th>District - Thana/Upz - Union<br>Mouza - Ward No</th>
                <th>Designation<br>Post</th>
                <th>Education Levels</th>
                <th>MPO Levels</th>
                <th>Teachers Contact</th>
                <th>SSC Depts</th>
                <th>HSC Depts</th>
                <th>Pre. 3 Years Students<br>${this.yearMinus2} - ${this.yearMinus3} - ${this.yearMinus4}</th>
                <th>Total Students<br>${this.yearMinus1}</th>
                <th>Classwise Students<br>${this.yearMinus1}</th>
              </tr>
            </thead>
            <tbody>
              ${selectedVacancies.map((vac, i) => {
      const param = vac.parameter?.results?.[0] || {};
      const getList = (str?: string) =>
        str ? str.split(',').map(s => s.trim()).join('<br>') : 'N/A';

      const recordHTML = this.parseJSON(param.Record || '')
        .map((row: string[]) =>
          `<tr>${row.map((cell: string) => `<td>${cell === 'কোনোটিই নয়' ? '' : cell}</td>`).join('')}</tr>`
        ).join('');

      const record2HTML = this.parseJSON(param.Record2 || '')
        .map((row: string[]) =>
          `<tr>${row.map((cell: string) => `<td>${cell === 'কোনোটিই নয়' ? '' : cell}</td>`).join('')}</tr>`
        ).join('');

      const preStatsHTML = param.PreStats?.split(';').map((row: string) =>
        `<tr>${row.split(',').map(cell =>
          `<td>${cell === 'কোনোটিই নয়' ? '' : cell.trim()}</td>`).join('')}</tr>`
      ).join('') || '';

      return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${vac.EIIN}<br>${vac.Name}</td>
                    <td>${vac.District || ''} - ${vac.Thana || ''} - ${param.Rejion || ''}<br>
                        ${param.Mouza || ''} - Ward No. ${param.WardNo || 'N/A'}</td>
                    <td>${vac.Designation}<br>${vac.Subject}</td>
                    <td>${getList(param.EducationLevels) || ''}</td>
                    <td>${getList(param.MPO) || ''}</td>
                    <td>${getList(param.Contact) || ''}</td>
                    <td>${getList(param.SSCDepts) || ''}</td>
                    <td>${getList(param.HSCDepts) || ''}</td>
                    <td><table>${preStatsHTML || ''}</table></td>
                    <td><table>${recordHTML || ''}</table></td>
                    <td><table>${record2HTML || ''}</table></td>
                  </tr>`;
    }).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    } else {
      this.showNoDataAlert10 = false;
      setTimeout(() => this.showNoDataAlert10 = true);
    }
  }

  get isAllSelected(): boolean {
    return this.vacancies.length > 0 && this.vacancies.every(v => this.selectedEIINs.has(v.EIIN));
  }

  applyToken(): void {
    if (!this.newToken || this.newToken.length !== 8) {
      this.showNoDataAlert7 = false;
      setTimeout(() => this.showNoDataAlert7 = true);
      return;
    }

    this.http.get<any>(`${environment.apiUrl}/token/?token=${this.newToken}`).subscribe({
      next: (res) => {
        const result = res?.results?.[0];
        console.log(result);

        if (result && result.Counter && Number(result.Status) === 0) {
          const newLimit = Number(result.Counter);
          this.freeUnlockLimit += newLimit;

          localStorage.setItem('freeUnlockLimit', this.freeUnlockLimit.toString());

          this.showNoDataAlert8 = false;
          setTimeout(() => this.showNoDataAlert8 = true);

          // 🔁 Update Token Status = 1 on the server
          this.http.post(`${environment.apiUrl}/token/${result.id}/update_status/`, { Status: 1 })
            .subscribe({
              next: () => console.log("Token status updated to 1"),
              error: err => console.error("Failed to update token status", err)
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

  recordRange: string = '';

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.dropdownx')) return;
    this.districtDropdownOpen = false;
    this.thanaDropdownOpen = false;
    this.clearDropdownLeaveTimer();
  }

  toggleDistrictDropdown(): void {
    this.thanaDropdownOpen = false;
    this.districtDropdownOpen = !this.districtDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  toggleThanaDropdown(): void {
    this.districtDropdownOpen = false;
    this.thanaDropdownOpen = !this.thanaDropdownOpen;
    this.clearDropdownLeaveTimer();
  }

  onDropdownEnter(kind: 'district' | 'thana'): void {
    this.dropdownLeaveKind = kind;
    this.clearDropdownLeaveTimer();
  }

  onDropdownLeave(kind: 'district' | 'thana'): void {
    this.dropdownLeaveKind = kind;
    this.dropdownLeaveTimer = setTimeout(() => {
      if (this.dropdownLeaveKind === kind) {
        if (kind === 'district') this.districtDropdownOpen = false;
        else this.thanaDropdownOpen = false;
      }
      this.dropdownLeaveTimer = null;
    }, 1000);
  }

  private clearDropdownLeaveTimer(): void {
    if (this.dropdownLeaveTimer) {
      clearTimeout(this.dropdownLeaveTimer);
      this.dropdownLeaveTimer = null;
    }
    this.dropdownLeaveKind = null;
  }

  ngOnDestroy(): void {
    this.clearDropdownLeaveTimer();
  }

}
