import { delay, first, map, merge, mergeAll, mergeMap, Observable, of, tap } from "rxjs";
import { ArrayUnion, DocsService, DocsQuery } from "./docs";
import { OrderBy, TableData, DocsQueryWhere, TableFieldPrimitive } from "./table-data-source";
import { combineLatest } from "rxjs/internal/observable/combineLatest";
import { BehaviorSubject } from "rxjs/internal/BehaviorSubject";

export interface CollectionPaths {
  [key: string]: { // path
    [key: string]: TableData // doc id
  }
}

interface FixtureExport {
  [key:string]: { // collection name
    [key: string]: FixtureDoc // doc id or subcollection
  }
}

interface FixtureDoc { 
  [key: string]: unknown,
  subCollection?: FixtureExport
}

export function toCollectionPaths(e: FixtureExport, index?: CollectionPaths): CollectionPaths {
  if (!index) {
    index = {}
  }

  return Object.entries(e).reduce((accIndex: CollectionPaths, [collectionNamestring, collection]: [string, {[key: string]: FixtureDoc}]) => {
    
    const docs = Object.entries(collection).reduce((accCollection, [id, doc]) => {
      const {subCollection, ...data} = doc
      accCollection[id] = data
      if (subCollection) {
        toCollectionPaths(subCollection, accIndex)
      }
      return accCollection
    }, {} as {[key: string]: FixtureDoc})
    
    const path: string = `/${collectionNamestring}`
    accIndex[path] = docs as {[key: string]: TableData}
    return accIndex
  }, index)
}

export function toFixtureExport(cs: CollectionPaths): FixtureExport {
  return Object.entries(cs).reduce((m, c) => {
    const segments = c[0].split('/')
    if (segments.length > 1) {
      throw 'Not Implemented'
    }
    m[segments[0]] = c[1]
    return m
  }, {} as FixtureExport)
}

export class IndexedDbDocs implements DocsService {

  changes = new BehaviorSubject<string|null>(null)

  constructor(private params: {
    tables: Observable<CollectionPaths>,
  }){}

  valueChanges<T extends TableData>(params: DocsQuery): Observable<T[]> {
    return merge([
      this.params.tables,
      this.changes.pipe(
        mergeMap(p => p === params.path ? this.params.tables : of())
      )
    ]).pipe(
      mergeAll(),
      map(ts => this._getTableOrThrow(ts, params.path)),
      map(table => {
        const d = Object.values({...table}) as T[]
        const f = this.filterMemory<T>(d, params)
        return f
      }),
    )
  }

  count<T extends TableData>(params: DocsQuery): Observable<number> {
    return merge([
      this.params.tables,
      this.changes.pipe(
        mergeMap(p => p === params.path ? this.params.tables : of())
      )
    ]).pipe(
      mergeAll(),
      map(ts => this._getTableOrThrow(ts, params.path)),
      map(table => {
        const d = Object.values({...table}) as T[]
        const f = this.filterMemory<T>(d, params)
        return f.length
      }),
    )
  }

  create(params: {
    path: string,
    doc: TableData
  }): Observable<string> {
    return this.params.tables.pipe(
      first(),
      map(ts => this._getTableOrThrow(ts, params.path)),
      map(t => {
        const id = Object.keys(t).length.toString()
        const n = {...params.doc, id}
        t[id] = n
        return id
      }),
      delay(2000),
      tap(_ => this.changes.next(params.path))
    )
  }

  updateById(params: {
    path: string,
    partial?: TableData,
    arrayUnion?: ArrayUnion,
  }): Observable<void> {
    return this.params.tables.pipe(
      first(),
      map(ts => {
        const [collection, id] = this.parsePath(params.path)
        const t = this._getTableOrThrow(ts, collection)
        const n = {...t[id] as TableData, ...params.partial, id}
        t[id] = n
      }),
      tap(_ => this.changes.next(this.parsePath(params.path)[0])))
    }

  replaceById(params: {
    path: string,
    doc: TableData,
  }): Observable<void> {
    return this.params.tables.pipe(
      first(),
      map(ts => {
        const [collection, id] = this.parsePath(params.path)
        const t = this._getTableOrThrow(ts, collection)
        const n = {...params.doc, id}
        t[id] = n
      }),
      tap(_ => this.changes.next(this.parsePath(params.path)[0]))
    )
  }

  deleteById(params: {
    path: string,
  }): Observable<void> {
    const [collection, id] = this.parsePath(params.path)
    return this.params.tables.pipe(
      first(),
      map(ts => this._getTableOrThrow(ts, collection)),
      map((t) => {
        delete t[id]
      }),
      tap(_ => this.changes.next(this.parsePath(params.path)[0]))
    )
  }

  parsePath(path: string): [string, string] {
    const segments = path.split('/')
    const collection = segments.slice(0, segments.length - 1).join('/')
    const id = segments[segments.length - 1]
    return [collection, id]
  }

  _getTableOrThrow(tables: {[key: string]: {[key: string]: unknown}}, path: string, scope?: string) {
    if (!scope) {
      scope = ''
    }
    const t =  tables[`${scope}/${path}`] || tables[path]
    if (!t) {
      throw new Error(`Expected memory table to be defined for path ${path}.`)
    }
    return t
  }

  private filterMemory<T extends TableData> (
    d: T[],
    q: DocsQuery
  ) {
    let f = [...d]
    if (q.where) {
      f = this.filterAnd(f, q.where)
    }
    if (q.orderBy) {
      this.order(f, q.orderBy)
    }
    if (q.startAfter) {
      const id = q.idField ?? 'id'
      const i = f.findIndex(r => r[id] === q.startAfter![id])
      if (i) {
        f.splice(0, i+1)
      }
    }
    if (q.limit) {
      f.splice(q.limit)
    }
    return f
  }

  private filterAnd<T extends TableData>(f: T[], a: DocsQueryWhere[]) {
    for (const q of a) {
      f = this.filter(f, q)
    }
    return f
  }

  private filter<T extends TableData>(f: T[], q: DocsQueryWhere): T[] {
    const operator = q[1]
    if (operator === '==') {
      return [...f.filter(r => r[q[0]] === q[2])]
    }
    if (operator === 'array-contains') {
      return [...f.filter(r => (r[q[0]] as TableFieldPrimitive[]).includes(q[2] as TableFieldPrimitive))]
    }
    if (operator === 'in') {
      return [...f.filter(r => (q[2] as TableFieldPrimitive[]).includes(r[q[0]] as TableFieldPrimitive))]
    }
    throw new Error('Operator not implemented for IndexedDb.')
  }

  private order<T>(data: T[], order: OrderBy[]): void {
    order.reduceRight((_: null | void, o): void => {
      const [key, direction] = o
      data.sort((a: any, b: any) => {
        const isAsc = direction.toLowerCase() === 'asc';
        switch (key) {
          // case 'title': return compare(a.title, b.title, isAsc);
          // case 'id': return compare(+a.id, +b.id, isAsc);
          default: return this.compare(a[key], b[key], isAsc);
        }
      });
    }, null)
  }

  private compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

}