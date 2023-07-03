import { Inject, Injectable } from '@angular/core';
import { Observable, map, of, reduce } from 'rxjs';
import { DocsService, Filter, Query, SearchParameters } from '@commonshcs-angular'

@Injectable({
  providedIn: 'root'
})
export class SearchDocsService {

  constructor(
    @Inject('DocsService') private docs: DocsService
  ) { }

  valueChanges<T>(params?: SearchParameters): Observable<T[] | null> {
    return this._matches<T>(params).pipe(
      map(rs => {
        if (!rs) {
          return rs
        }
        let start = 0
        if (params?.startAfter) {
          start = rs.findIndex(r => (r as any)['id'] === (params.startAfter as any)['id'])
        }
        if (params?.startAfter || params?.limit) {
          const end = params.limit ? start + params.limit : undefined
          return rs.slice(start, end)
        } else {
          return rs
        }
      })
    )
  }

  _matches<T>(params?: SearchParameters): Observable<T[] | null> {
    if (!params?.index) {
      throw new Error('Not Implemented')
    }
    const cs = this.docs.valueChanges({idField: 'id', path: params.index})
    if (!params.query) {
      return cs as any as Observable<T[]>
    }
    return cs.pipe(
      map(rs => {
        return rs?.filter(r => {
          let m = this._match(r, params.query!.q)
          if (params.query!.include && params.query!.include.length > 0) {
            m = m && this.or(r, params.query!.include)
          }
          if (params.query!.exclude && params.query!.exclude.length > 0) {
            m = m && !this.or(r, params.query!.exclude)
          }
          return m
        }) as T[]
      }),
    )
  }

  count(params?: SearchParameters): Observable<number> {
    return this._matches<unknown>(params).pipe(
      map(rs => rs?.length ?? 0)
    )
  }

  or(r: any, fs: Filter[]): boolean {
    for (let f of fs) {
      if (this._match(r, f)) {
        return true
      }
    }
    return false
  }

  _match(r: any, f: Filter) {
    if (f.column) {
      return this._matchColumn(r, f.column, !!f.keyword, f.value)
    } else {
      for (let c of Object.keys(r)) {
        if (this._matchColumn(r, c, !!f.keyword, f.value)) {
          return true
        }
      }
    }
  }

  _matchColumn(r: any, column: string, keyword: boolean, value: string) {
    if (keyword) {
      return r[column] === value
    } else if (!!r[column].toLowerCase) {
      return r[column].toLowerCase().includes(value.toLowerCase())
    }
    return false
  }

}
