import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-mcqoptions',
  templateUrl: './mcqoptions.component.html',
  styleUrls: ['./mcqoptions.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => McqOptionsComponent),
      multi: true
    }
  ]
})
export class McqOptionsComponent implements ControlValueAccessor {
  options: any[] = [
    { label: 'A', text: '', isCorrect: false },
    { label: 'B', text: '', isCorrect: false }
  ];
  
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: any[]): void {
    if (value && Array.isArray(value)) {
      this.options = value;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  addOption(): void {
    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const nextLabel = labels[this.options.length] || String.fromCharCode(65 + this.options.length);
    this.options.push({ label: nextLabel, text: '', isCorrect: false });
    this.notifyChange();
  }

  removeOption(index: number): void {
    if (this.options.length > 2) {
      this.options.splice(index, 1);
      this.notifyChange();
    }
  }

  onOptionChange(): void {
    this.notifyChange();
  }

  onCorrectChange(index: number): void {
    // Only one correct answer for now
    this.options.forEach((opt, i) => {
      opt.isCorrect = i === index;
    });
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onChange(this.options);
    this.onTouched();
  }
}

