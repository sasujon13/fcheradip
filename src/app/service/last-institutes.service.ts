import { Injectable } from '@angular/core';

const STORAGE_KEY = 'lastInstitutesShown';

export interface LastInstitutesState {
  query: string;
  results: any[];
}

@Injectable({
  providedIn: 'root'
})
export class LastInstitutesService {
  private last: LastInstitutesState | null = null;
  private loadedFromStorage = false;

  setLastShown(query: string, results: any[]): void {
    if (!Array.isArray(results) || results.length === 0) return;
    this.last = { query: (query || '').trim(), results: [...results] };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.last));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.last));
    } catch {
      // ignore
    }
  }

  private loadFromStorage(): void {
    if (this.loadedFromStorage) return;
    this.loadedFromStorage = true;
    try {
      let raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LastInstitutesState;
        if (Array.isArray(parsed?.results) && parsed.results.length > 0) {
          this.last = { query: parsed.query || '', results: parsed.results };
        }
      }
    } catch {
      // ignore
    }
  }

  getLastShown(): LastInstitutesState | null {
    this.loadFromStorage();
    return this.last && this.last.results.length > 0 ? this.last : null;
  }

  private eiinFromInstitute(inst: any): string | null {
    if (!inst) return null;
    const v = inst.eiinNo ?? inst.EIIN ?? inst.eiin ?? inst.eiin_no ?? inst.id;
    if (v != null && v !== '') return String(v);
    return null;
  }

  getFirstEiin(): string | null {
    const inst = this.getFirstInstitute();
    return inst ? this.eiinFromInstitute(inst) : null;
  }

  getFirstInstitute(): any | null {
    const state = this.getLastShown();
    return state && state.results.length > 0 ? state.results[0] : null;
  }

  /**
   * Best match from last-shown results when the slug matches an institute name or the last search.
   * - Exact/substring match on name or nameBn.
   * - First-word match: slug "SHAKHRIA HIG123" matches institute "SHAKHRIA HIGH SCHOOL" via first word "SHAKHRIA".
   * - Stored-query match: if user had searched "SHAKHRIA" and slug is "SHAKHRIA HIG123", use that search's first result.
   * Does NOT use unrelated first result (e.g. initial load with empty query).
   */
  getBestMatchForSlug(slug: string): { institute: any; eiin: string } | null {
    const state = this.getLastShown();
    if (!state || !state.results.length || !slug || !String(slug).trim()) return null;
    const s = String(slug).trim();
    const sUpper = s.toUpperCase();
    const firstWord = s.split(/\s+/)[0] || '';
    const firstWordUpper = firstWord.toUpperCase();
    const firstWordMinLen = 2;

    for (const inst of state.results) {
      const eiin = this.eiinFromInstitute(inst);
      if (!eiin) continue;
      const name = (inst.instituteName || inst.Name || '').trim();
      const nameBn = (inst.instituteNameBn || '').trim();
      const nameUpper = name.toUpperCase();
      const slugInName = name.length > 0 && (name.includes(s) || nameUpper.includes(sUpper));
      const slugInNameBn = nameBn.length > 0 && nameBn.includes(s);
      const nameInSlug = name.length > 0 && (s.includes(name) || sUpper.includes(nameUpper));
      const nameBnInSlug = nameBn.length > 0 && s.includes(nameBn);
      if (slugInName || slugInNameBn || nameInSlug || nameBnInSlug) {
        return { institute: inst, eiin };
      }
      if (firstWord.length >= firstWordMinLen) {
        const nameStartsWith = nameUpper.startsWith(firstWordUpper) || nameBn.startsWith(firstWord);
        const nameContainsWord = nameUpper.includes(firstWordUpper) || nameBn.includes(firstWord);
        if (nameStartsWith || nameContainsWord) {
          return { institute: inst, eiin };
        }
      }
    }

    const query = (state.query || '').trim();
    if (query.length >= firstWordMinLen && state.results.length > 0) {
      const slugStartsWithQuery = sUpper.startsWith(query.toUpperCase()) || query.toUpperCase().startsWith(firstWordUpper);
      const slugContainsQuery = sUpper.includes(query.toUpperCase());
      if (slugStartsWithQuery || slugContainsQuery) {
        const first = state.results[0];
        const eiin = this.eiinFromInstitute(first);
        if (eiin) return { institute: first, eiin };
      }
    }
    return null;
  }
}
