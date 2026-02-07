import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'orderBy'
})
export class OrderByPipe implements PipeTransform {
  transform(array: any[], field: string): any[] {
    if (!Array.isArray(array) || !field) return array;

    return array.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      // Move empty or undefined values to the end
      const aEmpty = aVal === null || aVal === undefined || aVal === '';
      const bEmpty = bVal === null || bVal === undefined || bVal === '';

      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      // Numeric comparison if both values are numbers
      if (!isNaN(aVal) && !isNaN(bVal)) {
        return Number(aVal) - Number(bVal);
      }

      // Otherwise fallback to string comparison
      return aVal.toString().localeCompare(bVal.toString());
    });
  }
}
