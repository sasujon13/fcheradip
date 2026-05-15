import { Pipe, PipeTransform } from '@angular/core';
import { resolveCoinEmoji } from './coin-emoji.util';

/**
 * Renders 🪙 when the browser likely paints it; otherwise 💰 (see coin-emoji.util).
 * Usage: <span aria-hidden="true">{{ null | coinEmoji }}</span>
 */
@Pipe({ name: 'coinEmoji', pure: true })
export class CoinEmojiPipe implements PipeTransform {
  transform(_value: unknown): string {
    return resolveCoinEmoji();
  }
}
