import { Pipe, PipeTransform } from '@angular/core';
import { formatCoinCounter } from './coin-counter-format.util';

/** Formats coin balance for `.rmsg` counter (see `formatCoinCounter`). */
@Pipe({ name: 'coinCounter', pure: true })
export class CoinCounterPipe implements PipeTransform {
  transform(value: unknown): string {
    return formatCoinCounter(value);
  }
}
