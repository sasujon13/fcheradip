import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';

interface BookAsset {
  id: number; title: string; asset_type: string; file_format: string;
  file_url: string; external_url: string;
}

interface Book {
  id: number; title: string; title_bn: string; slug: string; subtitle: string;
  description: string; author: string; editor: string; publisher: string; isbn: string;
  language: string; edition: string; publication_year?: number; page_count: number;
  book_type: string; book_type_label: string; audience: string; audience_label: string;
  preview_text: string; video_url: string; digital_price: string;
  compare_at_price?: string | null; hard_copy_available: boolean;
  hard_copy_price?: string | null; hard_copy_quantity: number;
  cover_image_url: string; wide_cover_image_url: string;
  digital_variant_id?: number | null; hard_copy_variant_id?: number | null;
  available_formats: string[]; assets: BookAsset[]; featured: boolean;
}

interface Cart { token: string; items: Array<{ quantity: number }>; subtotal: number; }

@Component({
  selector: 'app-books',
  templateUrl: './books.component.html',
  styleUrls: ['./books.component.css'],
  standalone: false,
})
export class BooksComponent implements OnInit {
  private readonly api = `${environment.apiUrl}/ecommerce`;
  readonly avatar = 'assets/cheradip/cheradip-avatar.png';
  readonly wideLogo = 'assets/images/cheradip.svg';
  books: Book[] = [];
  selectedBook: Book | null = null;
  cart: Cart | null = null;
  loading = false;
  adding = false;
  error = '';
  message = '';
  search = '';
  audience = '';
  bookType = '';
  language = '';
  copyType: 'hard' | 'soft' | 'both' = 'soft';
  ordering = '-featured';

  readonly audiences = [
    ['', 'All readers'], ['student', 'Students'], ['job_seeker', 'Job seekers'],
    ['teacher', 'Teachers'], ['children', 'Children'], ['general', 'General readers'],
  ];
  readonly bookTypes = [
    ['', 'All book types'], ['test_paper', 'Test papers'], ['job_solution', 'Job solutions'],
    ['admission_guide', 'Admission guides'], ['academic_guide', 'Academic guides'],
    ['teacher_guide', 'Teacher guides'], ['textbook', 'Textbooks'], ['grammar', 'Grammar'],
    ['story', 'Stories and novels'], ['literature', 'Literature'], ['writer_book', 'Books by writers'],
    ['reference', 'Reference books'], ['creative', 'Creative writing and essays'], ['other', 'Other books'],
  ];

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit(): void {
    this.loadBooks();
    this.loadCart(localStorage.getItem('cheradipEcommerceCart') || undefined);
  }

  loadBooks(): void {
    this.loading = true;
    this.error = '';
    let params = new HttpParams().set('ordering', this.ordering);
    if (this.search.trim()) params = params.set('search', this.search.trim());
    if (this.audience) params = params.set('audience', this.audience);
    if (this.bookType) params = params.set('book_type', this.bookType);
    if (this.language) params = params.set('language', this.language);
    params = params.set('copy_type', this.copyType);
    this.http.get<any>(`${this.api}/books/`, { params }).subscribe({
      next: data => { this.books = Array.isArray(data) ? data : (data.results || []); this.loading = false; },
      error: err => { this.loading = false; this.showError(err, 'Could not load the book list. Please try again.'); },
    });
  }

  resetFilters(): void {
    this.search = ''; this.audience = ''; this.bookType = ''; this.language = '';
    this.copyType = 'soft'; this.ordering = '-featured'; this.loadBooks();
  }

  openBook(book: Book): void {
    this.http.get<Book>(`${this.api}/books/${encodeURIComponent(book.slug)}/`).subscribe({
      next: detail => this.selectedBook = detail,
      error: err => this.showError(err, 'Could not load the book details. Please try again.'),
    });
  }

  closeBook(): void { this.selectedBook = null; }

  addBook(book: Book, format: 'digital' | 'hardcopy', buyNow = false): void {
    const variantId = format === 'digital' ? book.digital_variant_id : book.hard_copy_variant_id;
    if (!variantId || (format === 'hardcopy' && book.hard_copy_quantity < 1)) return;
    const url = this.cart?.token ? `${this.api}/cart/${this.cart.token}/` : `${this.api}/cart/`;
    this.adding = true;
    this.http.post<Cart>(url, { variant_id: variantId, quantity: 1 }).subscribe({
      next: cart => {
        this.rememberCart(cart); this.adding = false;
        this.message = `${book.title_bn || book.title} was added to your cart.`;
        if (buyNow) this.router.navigate(['/ecommerce'], { queryParams: { view: 'cart' } });
      },
      error: err => { this.adding = false; this.showError(err, 'Could not add this book to your cart. Please try again.'); },
    });
  }

  sample(book: Book): BookAsset | null { return book.assets.find(asset => asset.asset_type === 'sample') || null; }
  assetUrl(asset: BookAsset): string { return asset.file_url || asset.external_url || '#'; }
  cover(book: Book, wide = false): string {
    return (wide ? book.wide_cover_image_url : book.cover_image_url) || (wide ? this.wideLogo : this.avatar);
  }
  onCoverError(event: Event, wide = false): void { (event.target as HTMLImageElement).src = wide ? this.wideLogo : this.avatar; }
  get cartCount(): number { return (this.cart?.items || []).reduce((total, item) => total + item.quantity, 0); }

  private loadCart(token?: string): void {
    const url = token ? `${this.api}/cart/${encodeURIComponent(token)}/` : `${this.api}/cart/`;
    this.http.get<Cart>(url).subscribe({
      next: cart => this.rememberCart(cart),
      error: () => { localStorage.removeItem('cheradipEcommerceCart'); if (token) this.loadCart(); },
    });
  }
  private rememberCart(cart: Cart): void { this.cart = cart; localStorage.setItem('cheradipEcommerceCart', cart.token); }
  private showError(error: HttpErrorResponse, fallback: string): void { this.message = ''; this.error = error.error?.detail || fallback; }
}
