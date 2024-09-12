import { Component, OnInit } from '@angular/core';
import { CartService } from 'src/app/service/cart.service';
import { ChoiceService } from 'src/app/service/choice.service';

@Component({
  selector: 'app-choice',
  templateUrl: './choice.component.html',
  styleUrls: ['./choice.component.css']
})
export class ChoiceComponent implements OnInit {
  showCard: boolean = false;
  showChoice: boolean = true;
  public productList: any;
  public cartProductList: any;
  public choiceProductList: any;
  public filterCategory: any;
  searchKey: string = "";
  
  closeTimer: any;
  selectedType: string = '';
  selectedSize: string = '';
  filterType: string = '';
  filterSize: string = '';
  selectedFilter: string = '';
  
    SIZE = [
      { label: 'All', value: '' },
      { label: 'XXL', value: 'XXL' },
      { label: 'XL', value: 'XL' },
      { label: 'L', value: 'L' },
      { label: 'M', value: 'M' },
      { label: 'S', value: 'S' },
      { label: 'XS', value: 'XS' }
    ];
    constructor(private cartService: CartService, private choiceService: ChoiceService) { }
    ngOnInit(): void {
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'block';
    }
    // document.addEventListener('contextmenu', function (event) {
    //   event.preventDefault();
    // });
      this.choiceService.getChoiceProducts()
        .subscribe(res => {
          this.productList = res;
          this.cartProductList = res;
          this.choiceProductList = res;
          this.filterCategory = res;
          this.productList.forEach((a: any) => {
            const cartState = localStorage.getItem(`cartState_${a.id}`);
            const choiceState = localStorage.getItem(`choiceState_${a.id}`);
            if (choiceState === 'true') {
              a.love = true;
            }
            if (a.size === "XS") {
              a.size = "XS";
            } else if (a.size === "S") {
              a.size = "S";
            } else if (a.size === "M") {
              a.size = "M";
            } else if (a.size === "L") {
              a.size = "L";
            } else if (a.size === "XL") {
              a.size = "XL";
            } else if (a.size === "XXL") {
              a.size = "XXL";
            } 
            a.add_to_cart = cartState === 'true'; 
            a.add_to_choice = choiceState === 'true';                 
            Object.assign(a, { quantity: 1, total: a.price });
          });
  
          this.cartProductList.forEach((a: any) => {
            const cartState = localStorage.getItem(`cartState_${a.id}`);
            if (a.size === "XS") {
              a.size = "XS";
            } else if (a.size === "S") {
              a.size = "S";
            } else if (a.size === "M") {
              a.size = "M";
            } else if (a.size === "L") {
              a.size = "L";
            } else if (a.size === "XL") {
              a.size = "XL";
            }  else if (a.size === "XXL") {
              a.size = "XXL";
            } 
            a.add_to_cart = cartState === 'true';                  
            Object.assign(a, { quantity: 1, total: a.price });
          });
          
          this.choiceProductList.forEach((a: any) => {
            const choiceState = localStorage.getItem(`choiceState_${a.id}`);
            if (a.size === "XS") {
              a.size = "XS";
            } else if (a.size === "S") {
              a.size = "S";
            } else if (a.size === "M") {
              a.size = "M";
            } else if (a.size === "L") {
              a.size = "L";
            } else if (a.size === "XL") {
              a.size = "XL";
            }else if (a.size === "XXL") {
              a.size = "XXL";
            } 
            a.add_to_choice = choiceState === 'true';                  
            Object.assign(a, { quantity: 1, total: a.price });
          });
        });
      this.cartService.search.subscribe((val: any) => {
        this.searchKey = val;
      });
      this.choiceService.search.subscribe((val: any) => {
        this.searchKey = val;
      });
    }
    addtocart(item: any) {
      if (item.in_stock < 1) {
      return;
    }
      const sessionCartItems = JSON.parse(sessionStorage.getItem('sessionCartItems') || '[]');
  
      if (!sessionCartItems.find((storedItem: any) => storedItem.id === item.id)) {
        this.cartService.addtocart(item);
        item.add_to_cart = true;
        sessionCartItems.push(item);
        sessionStorage.setItem('sessionCartItems', JSON.stringify(sessionCartItems));
        localStorage.setItem(`cartState_${item.id}`, 'true');
      }
    }
  
    addtochoice(item: any) {
      const sessionChoiceItems = JSON.parse(sessionStorage.getItem('sessionChoiceItems') || '[]');
  
      if (!sessionChoiceItems.find((storedItem: any) => storedItem.id === item.id)) {
        this.choiceService.addtochoice(item);
        item.love = true;
        sessionChoiceItems.push(item);
        sessionStorage.setItem('sessionChoiceItems', JSON.stringify(sessionChoiceItems));
        localStorage.setItem(`choiceState_${item.id}`, 'true');
      }
      else {
        this.removeChoiceItem(item);
      }
    }
    removeChoiceItem(item: any) {
      this.choiceService.removeChoiceItem(item);
      item.love = false;
    }
    filterItem() {
      this.showChoice = true;
    }
    filterTypes(type: string) {
      this.selectedType = type;
      this.applyCombinedFilter();
    }
    
    onSizeChange(event: any) {
      this.selectedSize = event.target.value;
      this.applyCombinedFilter();
    }
    emptychoice(){
      this.choiceService.removeAllChoice();
    }
    
    applyCombinedFilter() {
      if (this.selectedType === '') {
        this.filterCategory = this.productList;
      } else {
        this.filterCategory = this.productList.filter((a: any) => a.types === this.selectedType);
      }
    
      if (this.selectedSize !== '') {
        this.filterCategory = this.filterCategory.filter((a: any) => a.size === this.selectedSize);
      }
    }
  
    filter(filter: string) {
      this.selectedSize = 'All';
      this.selectedFilter = filter;
      if (this.filterType) {
        this.filterCategory = this.productList.filter((a: any) => 
          (a.size === filter || filter === '') && (a.types === this.filterType || this.filterType === '')
        );
      } else {
        this.filterCategory = this.productList.filter((a: any) => a.size === filter || filter === '');
      }
    }
    productPrice(item: any): number {
      return Math.ceil(item.price * ((100  - item.discount)/100));
    }
  
    toggleCard() {
      this.showCard = !this.showCard;
    }
  }