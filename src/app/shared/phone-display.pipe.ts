import { Pipe, PipeTransform } from '@angular/core';

/** Presentation only: do not rewrite account identifiers or login state. */
export function localContact(value: unknown, country: unknown = 'BD'): string {
  const original=String(value ?? '').trim();
  if (!['BD','BANGLADESH','+880','880'].includes(String(country || '').trim().toUpperCase())) return original;
  const digits=original.replace(/[\s().-]/g,'');
  return /^1[3-9]\d{8}$/.test(digits) ? '0'+digits : original;
}

@Pipe({name:'localContact',standalone:true})
export class PhoneDisplayPipe implements PipeTransform {
  transform(value: unknown,country: unknown='BD'): string {return localContact(value,country);}
}
