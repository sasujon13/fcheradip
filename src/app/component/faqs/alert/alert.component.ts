import { Component, Input } from '@angular/core'; // Import Input from '@angular/core'

@Component({
  selector: 'app-alert', // Selector for the component
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css']
})
export class AlertComponent {
  @Input() message: string = '';  // Input property for the alert message
  @Input() showAlert: boolean = false;  // Input property to control visibility of the alert
}
