import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-questioneditor',
  templateUrl: './questioneditor.component.html',
  styleUrls: ['./questioneditor.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => QuestionEditorComponent),
      multi: true
    }
  ]
})
export class QuestionEditorComponent implements ControlValueAccessor {
  @Input() placeholder: string = 'Enter question text...';
  
  value: string = '';
  onChange: any = () => {};
  onTouched: any = () => {};

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  onInputChange(value: string): void {
    this.value = value;
    this.onChange(value);
    this.onTouched();
  }
}

