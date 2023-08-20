import { Injectable } from "@angular/core";
import { DuckdbClient } from './duckdb-client'
import { from } from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class DuckdbSqlService {

  constructor() {}

  makeClient(files?: {
    file: {
      name: string, // duckdb "registered" file name with file type extension
      url: () => Promise<string>
    },
    name: string, // name of table
    detect?: boolean,
    typed?: boolean
  }[]) {
    return from(DuckdbClient.of(files))
  }
}