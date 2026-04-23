import { Component, ElementRef, OnInit, AfterViewInit, ViewChild } from '@angular/core';
import { ApiService } from 'src/app/service/api.service';
import { LoadingService } from 'src/app/service/loading.service';
import * as jspdf from 'jspdf';
import html2canvas from 'html2canvas';


@Component({
  selector: 'app-order',
  templateUrl: './myorder.component.html',
  styleUrls: ['./myorder.component.css']
})
export class MyorderComponent implements OnInit, AfterViewInit {
  orders: any[] = [];
  displayedOrders: any[] = [];
  displayOrderCount = 10;
  showMoreButton = false;
  username: any;
  fullName: any;
  constructor(
    private apiService: ApiService,
    private loadingService: LoadingService
  ) {}
  ngOnInit(): void {
    this.loadingService.setTotal(1);
    this.username = localStorage.getItem('username');
    this.fullName = localStorage.getItem('fullName');
    this.loadData();
    this.updateDisplayedOrders();
    const searchBarElement = document.getElementById('searchBar');
    if (searchBarElement) {
      searchBarElement.style.display = 'none';
    }
    document.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
  }
  ngAfterViewInit(): void {
    setTimeout(() => this.loadingService.completeOne(), 0);
  }
  loadData() {
    this.apiService.myorder(this.username).subscribe(
      (response) => {
        if (response === "0 orders") {
          this.orders = [];
        } else {
          this.orders = response || [];
          if (this.orders.length > 0) {
            const element = document.querySelector(`#btnAll`) as HTMLElement;
            element.style.display = "block";
          }
          this.updateDisplayedOrders();
        }
      },
      (error) => {
      }
    );
    this.updateDisplayedOrders();
  }

  updateDisplayedOrders() {
    this.displayedOrders = this.orders.slice(0, this.displayOrderCount);

    this.showMoreButton = this.displayOrderCount < this.orders.length;
  }

  showMoreOrders() {
    this.displayOrderCount += 10;
    if (this.displayOrderCount > this.orders.length) {
      this.displayOrderCount = this.orders.length;
    }
    this.updateDisplayedOrders();
  }
  fullName2() {
    const name = this.fullName;
    return name;
  }
  getTotalOrderCount(): number {
    return this.orders.length || 0;
  }
  calculateSubTotal(order: any) {
    let subTotal = 0;
    let price = 0;
    let quantity = 0;
    let total = 0;
    for (const od of order.orderDetails) {
      price = Number(od.Price);
      quantity = Number(od.Quantity);
      total = price * quantity
      subTotal += total
    }
    return subTotal;
  }
  calculateDiscount(order: any) {
    let discount = 0;
    for (const od of order.orderDetails) {
      discount += Number(od.Discount);
    }
    return discount;
  }
  calculateDue(order: any) {
    let TotalProductPrice = 0;
    let shipingCost = 0;
    let grandTotal = 0;
    let due = 0;
    let paid = 0;
    for (const od of order.orderDetails) {
      TotalProductPrice = Number(od.GrandTotal);
      shipingCost = Number(od.ShipingCost);
      paid = Number(od.Paid);
    }
    grandTotal = TotalProductPrice + shipingCost
    due = grandTotal - paid
    return due;
  }
  parseAndSum(value1: any, value2: any) {
    const num1 = parseFloat(value1);
    const num2 = parseFloat(value2);
    return num1 + num2;
  }
  downloadAllAsPDF() {
    let maxI = -1;
    const orders = this.orders;
    orders.forEach((order, i) => {
      if (i > maxI) {
        maxI = i;
      }
    });
    const element = document.querySelector(`#allOrder`) as HTMLElement;
    const btnSM = document.querySelector(`#btnSM`) as HTMLElement;
    const btnAll = document.querySelector(`#btnAll`) as HTMLElement;
    const btnsToHide: HTMLElement[] = [btnSM, btnAll];
    for (let j = 0; j <= Number(maxI); j++) {
      const btnI = document.querySelector(`#btn${j}`) as HTMLElement;
      if (btnI) {
        btnsToHide.push(btnI);
      }
    }
    for (const btn of btnsToHide) {
      if (btn) {
        btn.style.display = 'none';
      }
    }
    if (element) {
      const container = document.querySelector(`#allOrder`) as HTMLElement;
      container.style.paddingLeft = '90px'; 
      document.body.style.width = '1200px';
      document.body.style.marginLeft = 'auto';
      document.body.style.marginRight = 'auto';
      const pdf = new jspdf.jsPDF();

      const img = new Image();
      img.src = '/assets/images/logo.jpg';
      img.onload = () => {
        const imgWidth1 = 96;
        const imgHeight1 = 36;
        const topMargin = 10;
        const leftMargin = (pdf.internal.pageSize.getWidth() - imgWidth1) / 2;
        const imgWidth = 210;
        const imgHeight = (img.height * imgWidth) / img.width;
        const pageContentHeight = (element.clientHeight * imgWidth) / element.clientWidth;

        pdf.addImage(img.src, 'JPEG', leftMargin, topMargin, imgWidth1, imgHeight1);

        html2canvas(element).then((canvas) => {
          const imgData = canvas.toDataURL('image/png');
          const imgWidth = 210; // Width of the PDF in mm (A4 size)
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          const pageImgData = canvas.toDataURL('image/png');
          const pageImgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(pageImgData, 'PNG', 0, imgHeight - 114.5, imgWidth, pageImgHeight);
          pdf.save('Order.pdf');
        });
      }
      setTimeout(() => {
        for (const btn2 of btnsToHide) {
          if (btn2) {
            btn2.style.display = 'block';
            document.body.style.width = '100%';
          }
        }
      }, 1000);
    } else {
      console.error('Element not found');
    }
  }

  downloadAsPDF(i: number) {
    const element = document.querySelector(`#order-${i}`) as HTMLElement;
    const btn = document.querySelector(`#btn${i}`) as HTMLElement;
    btn.style.display = 'none';

    if (element) {
      const container = document.querySelector(`#order-${i}`) as HTMLElement;
      container.style.paddingLeft = '100px'; 
      document.body.style.width = '1200px';
      document.body.style.marginLeft = 'auto';
      document.body.style.marginRight = 'auto';
      const pdf = new jspdf.jsPDF();

      const img = new Image();
      img.src = '/assets/images/logo.jpg';

      img.onload = () => {
        const imgWidth1 = 96;
        const imgHeight1 = 36;
        const topMargin = 10;
        const leftMargin = (pdf.internal.pageSize.getWidth() - imgWidth1) / 2;
        const imgWidth = 210;
        const imgHeight = (img.height * imgWidth) / img.width;
        const pageContentHeight = (element.clientHeight * imgWidth) / element.clientWidth;

        pdf.addImage(img.src, 'JPEG', leftMargin, topMargin, imgWidth1, imgHeight1);
        html2canvas(element).then((canvas) => {
          const pageImgData = canvas.toDataURL('image/png');
          const pageImgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.addImage(pageImgData, 'PNG', 0, imgHeight - 30, imgWidth, pageImgHeight);

          const filename = `Order${Number(i) + 1}.pdf`;
          pdf.save(filename);
          btn.style.display = 'block';
          document.body.style.width = '100%';
        });
      };
    } else {
      console.error('Element not found');
    }
  }
}
