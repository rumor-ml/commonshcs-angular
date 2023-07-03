import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { OrderBy, TableData } from './table-data-source';

export type Query = {
  q: Filter,
  include?: Filter[],
  exclude?: Filter[],
}

export type Filter = {
  column?: string,
  value: string,
  keyword?: boolean,
}

export interface SearchParameters {
  index?: string,
  query?: Query,
  orderBy?: OrderBy[],
  limit?: number,
  startAfter?: TableData
}


@Injectable({
  providedIn: 'root'
})
export class SearchService {

  constructor(
  ) { }

  valueChanges<T>(params?: SearchParameters): Observable<T[] | null> {
    return of()
  }

  count(params?: SearchParameters): Observable<number> {
    return of()
  }
}
