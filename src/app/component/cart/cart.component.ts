import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CartService } from 'src/app/service/cart.service';
import { LoadingService } from 'src/app/service/loading.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit, AfterViewInit {

  public products : any = [];
  public grandTotal !: number;
  public grandDiscount !: number;
  constructor(
    private cartService: CartService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.loadingService.setTotal(1);
    const searchBarElement = document.getElementById('searchBar');

  if (searchBarElement) {
    searchBarElement.style.display = 'none';
  }
    
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
    this.cartService.getCartProducts()
    .subscribe((res: any)=>{
      this.products = res;
      this.grandTotal = this.cartService.grandTotal();
      this.grandDiscount = this.cartService.grandDiscount();
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }

  removeCartItem(item: any){
    this.cartService.removeCartItem(item);
  }
  emptycart(){
    this.cartService.removeAllCart();
  }
  increaseQuantity(item: any) {
    this.cartService.changeQuantity(item.id, 1); // Increase quantity by 1
    this.grandTotal = this.cartService.grandTotal();
    this.grandDiscount = this.cartService.grandDiscount();
  }

  decreaseQuantity(item: any) {
    if (item.quantity > 1) {
      this.cartService.changeQuantity(item.id, -1); // Decrease quantity by 1 if greater than 1
      this.grandTotal = this.cartService.grandTotal();
      this.grandDiscount = this.cartService.grandDiscount();
    }
  }
  savedPrice(item: any): number {
    return Math.ceil(item.quantity * (item.weight * item.price * 100 / (100 - item.discount) - (item.weight * item.price)));
  }
  
  totalPrice(item: any): number {
    return Math.ceil(item.weight * item.quantity * item.price);
  }
  productPrice(item: any): number {
    return Math.ceil(item.weight * item.price * 100 / (100 - item.discount));
  }
  productPrice2(item: any): number {
    return Math.ceil(item.price * 100 / (100 - item.discount));
  }

}
