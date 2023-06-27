import { DataSource } from '@angular/cdk/collections';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { Observable, combineLatest, switchMap, tap, startWith, map } from 'rxjs';
import { DocsDelegate } from './docs';
import { Query, SearchParameters, SearchService } from './search';

export interface TableData {[key: string]: TableFieldValue}
export type TableFieldValue = TableFieldPrimitive | TableFieldPrimitive[] | TableData | TableData[] | undefined
export type TableFieldPrimitive = string | number | boolean | null

export interface DocsDelegateQuery {
  where?: DocsQueryWhere[],
  orderBy?: OrderBy[],
  limit?: number,
  startAfter?: TableData,
}

export type Operator = '==' | 'in' | 'array-contains'
export type OrderBy = [string, 'asc' | 'desc' | '']
export type DocsQueryWhere = [string, Operator, TableFieldPrimitive | TableFieldPrimitive[]]

export interface TableDataService<T extends TableData, U extends DocsDelegateQuery | SearchParameters> {

  valueChanges: {
    (params?: U)
    : Observable<T[] | null>
  }

  count: {
    (params?: U)
    : Observable<number>
  }
}

// The logic for the *TableDataSource is identical except for
// the handline of params. Common logic should be extracted
// into a base class.

export class DocsTableDataSource<T extends TableData> extends DataSource<T> {
  paginator: MatPaginator | undefined
  sort: MatSort | undefined
  lastRow: {[key: number]: T} = {}
  pageSize?: number

  constructor(
    private service: DocsDelegate<T>,
    private where?: Observable<DocsQueryWhere[]>,
  ) {
    super();
  }

  connect(): Observable<T[]> {
    if (this.paginator && this.sort) {
      const whereChanges = []
      if (this.where) {
        whereChanges.push(this.where.pipe(
          tap(_ => {
            this.lastRow = {}
            this.paginator!.firstPage()
          })
        ))
      }
      return combineLatest([
        this.paginator.page.pipe(
          startWith(null),
          tap(page => {
            if (this.pageSize !== undefined && page?.pageSize !== this.pageSize) {
              this.lastRow = {}
              this.paginator!.firstPage()
            }
            this.pageSize = page?.pageSize
          })
        ),
        this.sort.sortChange.pipe(
          startWith(this.sort),
          tap(_ => {
            this.lastRow = {}
            this.paginator!.firstPage()
          })
        ),
        ...whereChanges
      ]).pipe(
        switchMap(([page, sort, where]) => {
          const orderBy: {orderBy?: DocsDelegateQuery['orderBy']} = {}
          if (sort.active) {
            orderBy!.orderBy = [[sort.active, sort.direction]]
          }
          return this.service.valueChanges({
            where,
            ...orderBy,
            limit: this.paginator!.pageSize,
            startAfter: this.lastRow[page?.pageIndex ?? 0]
          }).pipe(
            map(p => p ?? []),
            tap(p => this.lastRow[this.paginator!.pageIndex + 1] = p[p.length - 1]),
          )
        })
      )
    } else {
      throw Error('Please set the paginator and sort on the data source before connecting.');
    }
  }

  disconnect(): void {}

}

export class SearchTableDataSource<T extends TableData> extends DataSource<T> {
  paginator: MatPaginator | undefined
  sort: MatSort | undefined
  lastRow: {[key: number]: T} = {}
  pageSize?: number

  constructor(
    private service: SearchService,
    private index?: string,
    private query?: Observable<Query>,
  ) {
    super();
  }

  connect(): Observable<T[]> {
    if (this.paginator && this.sort) {
      const queryChanges = []
      if (this.query) {
        queryChanges.push(this.query.pipe(
          tap(_ => {
            this.lastRow = {}
            this.paginator!.firstPage()
          })
        ))
      }
      return combineLatest([
        this.paginator.page.pipe(
          startWith(null),
          tap(page => {
            if (this.pageSize !== undefined && page?.pageSize !== this.pageSize) {
              this.lastRow = {}
              this.paginator!.firstPage()
            }
            this.pageSize = page?.pageSize
          })
        ),
        this.sort.sortChange.pipe(
          startWith(this.sort),
          tap(_ => {
            this.lastRow = {}
            this.paginator!.firstPage()
          })
        ),
        ...queryChanges
      ]).pipe(
        switchMap(([page, sort, query]) => {
          const orderBy: {orderBy?: DocsDelegateQuery['orderBy']} = {}
          if (sort.active) {
            orderBy!.orderBy = [[sort.active, sort.direction]]
          }
          return this.service.valueChanges<T>({
            index: this.index,
            query,
            ...orderBy,
            limit: this.paginator!.pageSize,
            startAfter: this.lastRow[page?.pageIndex ?? 0]
          }).pipe(
            map(p => p ?? []),
            tap(p => this.lastRow[this.paginator!.pageIndex + 1] = p[p.length - 1]),
          )
        })
      )
    } else {
      throw Error('Please set the paginator and sort on the data source before connecting.');
    }
  }

  disconnect(): void {}

}
