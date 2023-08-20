import * as arrow from "apache-arrow"
import * as duckdb from '@duckdb/duckdb-wasm';

const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

export class DuckdbClient {
  constructor(_db) {
    this._db = _db;
    this._counter = 0;
  }

  async queryStream(query, params) {
    const conn = await this.connection();
    let result;

    if (params) {
      const stmt = await conn.prepare(query);
      result = await stmt.query(...params);
    } else {
      result = await conn.query(query);
    }
    // Populate the schema of the results
    const schema = result.schema.fields.map(({ name, type }) => ({
      name,
      type: getType(String(type)),
      databaseType: String(type)
    }));
    return {
      schema,
      async *readRows() {
        let rows = result.toArray().map((r) => Object.fromEntries(r));
        yield rows;
      }
    };
  }

  // This function gets called to prepare the `query` parameter of the `queryStream` method
  queryTag(strings, ...params) {
    return [strings.join("?"), params];
  }

  escape(name) {
    return `"${name}"`;
  }

  async describeTables() {
    const conn = await this.connection();
    const tables = (await conn.query(`SHOW TABLES`)).toArray();
    return tables.map(({ name }) => ({ name }));
  }

  async describeColumns({ table } = {}) {
    const conn = await this.connection();
    const columns = (await conn.query(`DESCRIBE ${table}`)).toArray();
    return columns.map(({ column_name, column_type }) => {
      return {
        name: column_name,
        type: getType(column_type),
        databaseType: column_type
      };
    });
  }

  async db() {
    if (!this._db) {
      this._db = await makeDB();
      await this._db.open({
        query: {
          castTimestampToDate: true
        }
      });
    }
    return this._db;
  }

  async connection() {
    if (!this._conn) {
      const db = await this.db();
      this._conn = await db.connect();
    }
    return this._conn;
  }

  async reconnect() {
    if (this._conn) {
      this._conn.close();
    }
    delete this._conn;
  }

  // The `.queryStream` function will supercede this for SQL and Table cells
  // Keeping this for backwards compatibility
  async query(query, params) {
    const key = `Query ${this._counter++}: ${query}`;
    console.time(key);
    const conn = await this.connection();
    let result;

    if (params) {
      const stmt = await conn.prepare(query);
      result = stmt.query(...params);
    } else {
      result = await conn.query(query);
    }

    console.timeEnd(key);
    return result;
  }

  // The `.queryStream` function will supercede this for SQL and Table cells
  // Keeping this for backwards compatibility
  async sql(strings, ...args) {
    // expected to be used like db.sql`select * from table where foo = ${param}`

    // let queryWithParams = strings.join("?");
    // if (typeof args !== 'undefined'){
    //   for (const param of args) {
    //     queryWithParams = queryWithParams.replace('?', param);
    //   }
    // }
    // const results = await this.query(queryWithParams);

    const results = await this.query(strings.join("?"), args);

    // return rows as a JavaScript array of objects for now
    let rows = results.toArray().map(Object.fromEntries);
    rows.columns = results.schema.fields.map((d) => d.name);
    return rows;
  }

  async table(query, params, opts) {
    const result = await this.query(query, params);
    return Inputs.table(result, { layout: "auto", ...(opts || {}) });
  }

  // get the client after the query ran
  async client(query, params) {
    await this.query(query, params);
    return this;
  }

  // query a single row
  async queryRow(query, params) {
    const key = `Query ${this._counter++}: ${query}`;

    console.time(key);
    const conn = await this.connection();
    // use send as we can stop iterating after we get the first batch
    const result = await conn.send(query, params);
    const batch = (await result.next()).value;
    console.timeEnd(key);

    return batch?.get(0);
  }

  async explain(query, params) {
    const row = await this.queryRow(`EXPLAIN ${query}`, params);
    return element("pre", { className: "observablehq--inspect" }, [
      text(row["explain_value"])
    ]);
  }

  // Describe the database (no arg) or a table
  async describe(object) {
    const result = await (object === undefined
      ? this.query(`SHOW TABLES`)
      : this.query(`DESCRIBE ${object}`));
    return Inputs.table(result);
  }

  // Summarize a query result
  async summarize(query) {
    const result = await this.query(`SUMMARIZE ${query}`);
    return Inputs.table(result);
  }

  async insertJSON(name, buffer, options) {
    const db = await this.db();
    await db.registerFileBuffer(name, new Uint8Array(buffer));
    const conn = await db.connect();
    await conn.insertJSONFromPath(name, { name, schema: "main", ...options });
    await conn.close();

    return this;
  }

  async insertCSV(name, buffer, options) {
    const db = await this.db();
    await db.registerFileBuffer(name, new Uint8Array(buffer));
    const conn = await db.connect();
    await conn.insertCSVFromPath(name, { name, schema: "main", ...options });
    await conn.close();

    return this;
  }

  async insertParquet(name, buffer) {
    const db = await this.db();
    await db.registerFileBuffer(name, new Uint8Array(buffer));
    const conn = await db.connect();
    await conn.query(
      `CREATE VIEW '${name}' AS SELECT * FROM parquet_scan('${name}')`
    );
    await conn.close();

    return this;
  }

  async insertArrowTable(name, table, options) {
    const buffer = arrow.tableToIPC(table);
    return this.insertArrowFromIPCStream(name, buffer, options);
  }

  async insertArrowFromIPCStream(name, buffer, options) {
    const db = await this.db();
    const conn = await db.connect();
    await conn.insertArrowFromIPCStream(buffer, {
      name,
      schema: "main",
      ...options
    });
    await conn.close();

    return this;
  }

  // Create a database from FileArrachments
  static async of(files = []) {
    const db = await makeDB();
    await db.open({
      query: {
        castTimestampToDate: true
      }
    });

//     await db.registerFileText(`data.csv`, `gender_concept_id,race_concept_id,person_id,year_of_birth,month_of_birth,day_of_birth,birth_datetime,ethnicity_concept_id,location_id,provider_id,care_site_id,person_source_value,gender_source_value,gender_source_concept_id,race_source_value,race_source_concept_id,ethnicity_source_value,ethnicity_source_concept_id,race_concept_name,gender_concept_name
// 8507,0,-3210373572193940939,2079,,,,38003563,,,,10011398,M,0,,0,HISPANIC/LATINO,2000001408,No matching concept,MALE
// 8507,0,3589912774911670296,2095,,,,38003563,,,,10009628,M,0,,0,HISPANIC/LATINO,2000001408,No matching concept,MALE
// 8507,2000001402,-8769042030325953499,2138,,,,0,,,,10019917,M,0,OTHER,2000001402,,0,,MALE
// 8507,2000001402,349862308128216812,2089,,,,0,,,,10005866,M,0,OTHER,2000001402,,0,,MALE
// 8507,2000001402,-1095016967997700156,2041,,,,0,,,,10022281,M,0,OTHER,2000001402,,0,,MALE
// 8507,2000001402,-3611589607736625713,2123,,,,0,,,,10022041,M,0,OTHER,2000001402,,0,,MALE
// 8507,2000001402,-2312013739856114142,2030,,,,0,,,,10017492,M,0,OTHER,2000001402,,0,,MALE
// 8507,8527,-5829006308524050971,2086,,,,0,,,,10038999,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,8805478484003283429,2062,,,,0,,,,10013049,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,2213013192725646311,2122,,,,0,,,,10004720,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,1484542834460282651,2099,,,,0,,,,10021118,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,2601314283911413076,2070,,,,0,,,,10025463,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,1105072502834179413,2136,,,,0,,,,10019777,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,6543064765547201849,2133,,,,0,,,,10009035,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-6525152599927900344,2052,,,,0,,,,10005348,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,1194579079287927665,2089,,,,0,,,,10015931,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,7131048714591189903,2133,,,,0,,,,10015860,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,7155255168997124770,2086,,,,0,,,,10014354,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,1740609625029317924,2093,,,,0,,,,10018845,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,8692405834444096922,2119,,,,0,,,,10007058,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-8970844422700220177,2114,,,,0,,,,10038933,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,4668337230155062633,2073,,,,0,,,,10021487,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,4352191084057402257,2066,,,,0,,,,10005817,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,3912882389848878631,2084,,,,0,,,,10026406,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-8090189584974691216,2118,,,,0,,,,10009049,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-4234372750442829205,2090,,,,0,,,,10003046,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,225226226646982867,2058,,,,0,,,,10018501,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,8009761406928052418,2130,,,,0,,,,10022017,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,3665089643642765251,2085,,,,0,,,,10021666,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,7633320537823105326,2136,,,,0,,,,10019385,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-8254164865273971123,2094,,,,0,,,,10020740,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-4353160957725823366,2077,,,,0,,,,10007818,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,2631971469928551627,2085,,,,0,,,,10026354,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,8480470964666031560,2043,,,,0,,,,10025612,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,5548892236933978704,2073,,,,0,,,,10016150,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,817543968614095114,2125,,,,0,,,,10018423,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-2500070523286875699,2134,,,,0,,,,10026255,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-8993675534959689080,2116,,,,0,,,,10021938,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-4873075614181207858,2075,,,,0,,,,10004457,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-3024822967781525875,2050,,,,0,,,,10035185,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-8492299714241840941,2043,,,,0,,,,10023771,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,4087485459037740014,2096,,,,0,,,,10029484,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,4239478333578644568,2111,,,,0,,,,10022880,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-5342370696241135313,2033,,,,0,,,,10004422,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-626229666378242477,2117,,,,0,,,,10023117,M,0,WHITE,2000001404,,0,White,MALE
// 8507,8527,-1210657672714831684,2054,,,,0,,,,10018081,M,0,WHITE,2000001404,,0,White,MALE
// 8507,2000001401,-6681895148320589913,2059,,,,0,,,,10020944,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,7489836918826771862,2123,,,,0,,,,10004733,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,6339505631013617478,2059,,,,0,,,,10006053,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,7708191038975000369,2062,,,,0,,,,10012552,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,2161418207209636934,2060,,,,0,,,,10002495,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,4783904755296699562,2049,,,,0,,,,10035631,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,-9066461348710750663,2125,,,,0,,,,10037975,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,-3420195391796315831,2115,,,,0,,,,10038992,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,2000001401,579254014084392336,2038,,,,0,,,,10037861,M,0,UNKNOWN,2000001401,,0,,MALE
// 8507,8516,-775517641933593374,2149,,,,0,,,,10004235,M,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,MALE
// 8507,8516,-2575767131279873665,2050,,,,0,,,,10024043,M,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,MALE
// 8532,0,-2067961723109232727,2106,,,,38003563,,,,10020187,F,0,,0,HISPANIC/LATINO,2000001408,No matching concept,FEMALE
// 8532,0,1741351032930224901,2097,,,,38003563,,,,10037928,F,0,,0,HISPANIC/LATINO,2000001408,No matching concept,FEMALE
// 8532,0,-1616052813658226820,2074,,,,38003563,,,,10006580,F,0,,0,HISPANIC/LATINO,2000001408,No matching concept,FEMALE
// 8532,8527,-8352232581952957278,2059,,,,0,,,,10015272,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,7262671035615120930,2094,,,,0,,,,10027445,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,3192038106523208432,2083,,,,0,,,,10007795,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-6225647829918357531,2083,,,,0,,,,10019003,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,2341788304019377091,2130,,,,0,,,,10027602,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,2288881942133868955,2102,,,,0,,,,10001217,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-1115201667562228350,2062,,,,0,,,,10020640,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-4183220989401122518,2031,,,,0,,,,10031404,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-4502092208250381979,2071,,,,0,,,,10018328,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,4498126063475867818,2075,,,,0,,,,10002428,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,421426604671948641,2119,,,,0,,,,10010867,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,8090044958540695372,2079,,,,0,,,,10040025,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-6022656226246460545,2104,,,,0,,,,10014729,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,4985579811051920670,2064,,,,0,,,,10001725,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-7938198040010520706,2070,,,,0,,,,10031757,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-458664721446908388,2061,,,,0,,,,10019568,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,1258460361496302149,2108,,,,0,,,,10023239,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-8205283012979532608,2103,,,,0,,,,10020786,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-6289874722419061830,2104,,,,0,,,,10005909,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-8659404739579738033,2066,,,,0,,,,10010471,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,3773668700451843725,2070,,,,0,,,,10007928,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-7391666713304457659,2084,,,,0,,,,10008454,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,8527170356523164323,2128,,,,0,,,,10000032,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,-2286362762396278035,2073,,,,0,,,,10029291,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,8527,2188642953583197091,2102,,,,0,,,,10008287,F,0,WHITE,2000001404,,0,White,FEMALE
// 8532,2000001401,-7437341330444582833,2058,,,,0,,,,10021312,F,0,UNKNOWN,2000001401,,0,,FEMALE
// 8532,2000001401,-7671795861352464589,2052,,,,0,,,,10038081,F,0,UNKNOWN,2000001401,,0,,FEMALE
// 8532,2000001401,5734523979606454056,2069,,,,0,,,,10036156,F,0,UNKNOWN,2000001401,,0,,FEMALE
// 8532,2000001401,-8928428202649726867,2119,,,,0,,,,10016810,F,0,UNKNOWN,2000001401,,0,,FEMALE
// 8532,2000001405,1532249960797525190,2106,,,,0,,,,10014078,F,0,UNABLE TO OBTAIN,2000001405,,0,,FEMALE
// 8532,2000001405,5894416985828315484,2055,,,,0,,,,10019172,F,0,UNABLE TO OBTAIN,2000001405,,0,,FEMALE
// 8532,2000001405,-3780452582396805474,2058,,,,0,,,,10039831,F,0,UNABLE TO OBTAIN,2000001405,,0,,FEMALE
// 8532,8516,6128703162302148003,2120,,,,0,,,,10016742,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,-8891617624507360381,2067,,,,0,,,,10039997,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,5863607150722936210,2092,,,,0,,,,10039708,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,3129727379702505063,2145,,,,0,,,,10002930,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,-3908355835367628651,2062,,,,0,,,,10003400,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,-7636167699948083600,2105,,,,0,,,,10032725,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,7427037643503998178,2084,,,,0,,,,10012853,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// 8532,8516,7918537411740862407,2055,,,,0,,,,10020306,F,0,BLACK/AFRICAN AMERICAN,2000001406,,0,Black or African American,FEMALE
// `);

    // await db.registerFileURL('data.csv', 'http://localhost:5002/assets/bquxjob_515a05c6_18a0e5718bc.csv', 4)
    // const conn = await db.connect()
    // await conn.insertCSVFromPath('data.csv', {
    //   schema: 'main',
    //   name: 'foo',
    //   // detect: false,
    //   // header: false,
    //   // delimiter: '|',
    //   // columns: {
    //   //     col1: new arrow.Int32(),
    //   //     col2: new arrow.Utf8(),
    //   // }
    // });

    const toName = (file) =>
      file.name.split(".").slice(0, -1).join(".").replace(/\@.+?/, ""); // remove the "@X" versions Observable adds to file names

    if (files.constructor.name === "FileAttachment") {
      files = [[toName(files), files]];
    } else if (!Array.isArray(files)) {
      files = Object.entries(files);
    }

    // Add all files to the database. Import JSON and CSV. Create view for Parquet.
    await Promise.all(
      files.map(async (entry) => {
        let file;
        let name;
        let options = {};

        if (Array.isArray(entry)) {
          [name, file] = entry;
          if (file.hasOwnProperty("file")) {
            ({ file, ...options } = file);
          }
        } else if (entry.constructor.name === "FileAttachment") {
          [name, file] = [toName(entry), entry];
        } else if (typeof entry === "object") {
          ({ file, name, ...options } = entry);
          name = name ?? toName(file);
        } else {
          console.error("Unrecognized entry", entry);
        }

        console.log("entry", entry);
        console.log("file", file);
        console.log("name", name);
        console.log("options", options);

        if (!file.url && Array.isArray(file)) {
          const data = file;

          const table = arrow.tableFromJSON(data);
          const buffer = arrow.tableToIPC(table);

          const conn = await db.connect();
          await conn.insertArrowFromIPCStream(buffer, {
            name,
            schema: "main",
            ...options
          });
          await conn.close();
          return;
        } else {
          const url = await file.url();
          if (url.indexOf("blob:") === 0) {
            const buffer = await file.arrayBuffer();
            await db.registerFileBuffer(file.name, new Uint8Array(buffer));
          } else {
            await db.registerFileURL(file.name, url, 4);
          }
        }

        const conn = await db.connect();
        if (file.name.endsWith(".csv")) {
          await conn.insertCSVFromPath(file.name, {
            name,
            schema: "main",
            ...options
          });
        } else if (file.name.endsWith(".json")) {
          await conn.insertJSONFromPath(file.name, {
            name,
            schema: "main",
            ...options
          });
        } else if (file.name.endsWith(".parquet")) {
          await conn.query(
            `CREATE VIEW '${name}' AS SELECT * FROM parquet_scan('${file.name}')`
          );
        } else {
          console.warn(`Don't know how to handle file type of ${file.name}`);
        }
        await conn.close();
      })
    );

    return new DuckdbClient(db);
  }
}

// See https://duckdb.org/docs/sql/data_types/overview
const getType = (type) => {
  const typeLower = type.toLowerCase();
  switch (typeLower) {
    case "bigint":
    case "int8":
    case "long":
      return "bigint";

    case "double":
    case "float8":
    case "numeric":
    case "decimal":
    case "decimal(s, p)":
    case "real":
    case "float4":
    case "float":
    case "float32":
    case "float64":
      return "number";

    case "hugeint":
    case "integer":
    case "smallint":
    case "tinyint":
    case "ubigint":
    case "uinteger":
    case "usmallint":
    case "utinyint":
    case "smallint":
    case "tinyint":
    case "ubigint":
    case "uinteger":
    case "usmallint":
    case "utinyint":
    case "int4":
    case "int":
    case "signed":
    case "int2":
    case "short":
    case "int1":
    case "int64":
    case "int32":
      return "integer";

    case "boolean":
    case "bool":
    case "logical":
      return "boolean";

    case "date":
    case "interval": // date or time delta
    case "time":
    case "timestamp":
    case "timestamp with time zone":
    case "datetime":
    case "timestamptz":
      return "date";

    case "uuid":
    case "varchar":
    case "char":
    case "bpchar":
    case "text":
    case "string":
    case "utf8": // this type is unlisted in the `types`, but is returned by the db as `column_type`...
      return "string";
    default:
      return "other";
  }
}

function element(name, props, children) {
  if (arguments.length === 2) children = props, props = undefined;
  const element = document.createElement(name);
  if (props !== undefined) for (const p in props) element[p] = props[p];
  if (children !== undefined) for (const c of children) element.appendChild(c);
  return element;
}

function text(value) {
  return document.createTextNode(value);
}

async function makeDB() {
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
  const logger = new duckdb.ConsoleLogger();
  const worker = await duckdb.createWorker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule);
  return db
}