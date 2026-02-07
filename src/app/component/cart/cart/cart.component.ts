import { HttpClient } from '@angular/common/http';
import { Component, OnInit, Renderer2 } from '@angular/core';
import { CartService } from 'src/app/service/cart.service';

@Component({
  selector: 'app-cart',
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {

  public products : any = [];
  public grandTotal !: number;
  public grandDiscount !: number;
  constructor(private cartService : CartService, private http: HttpClient, private renderer: Renderer2) { }
    ngAfterViewInit(): void {
      const signMenu = document.getElementById('sign_menu');
      if (signMenu) {
        this.renderer.setStyle(signMenu, 'display', 'flex');
      }
    }

  ngOnInit(): void {
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
    })
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
