import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filter'
})
export class FilterPipe implements PipeTransform {

  transform(value: any[], filterString: string, propNames: string[]): any[] {
    if (!value || filterString === '' || propNames.length === 0) {
      return value;
    }

    const lower = filterString.toLowerCase();
    return value.filter((item: any) => {
      for (const propName of propNames) {
        const val = item[propName];
        if (val != null && String(val).toLowerCase().includes(lower)) {
          return true;
        }
      }
      return false;
    });
  }
}
