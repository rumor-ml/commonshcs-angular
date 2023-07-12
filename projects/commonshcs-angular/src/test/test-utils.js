const fs = require('fs/promises');
const { combineLatest, from, scan, filter, buffer, map, first, skip, tap, take, reduce } = require('rxjs');

const chunkSize = 1000;
const maxDocs = 8000;

exports.loadJson = async function (path) {
  return [JSON.parse(await fs.readFile(path))]
}

exports.loadLines = async function (path, fn) {
  const chunks = from(await fs.readFile(path)).pipe(
    scan(({h, n, _, cs}, c) => {
      cs.push(c)
      if (c === 10) {
        n += 1
        if (h && n === chunkSize) {
          return {h, n: 0, chunk:Buffer.from(cs).toString(), cs:[]}
        } else if (!h) {
          return {h:true, n: 0, chunk:Buffer.from(cs).toString(), cs:[]}
        }
      }
      return {h, n, chunk:null, cs}
    }, {
      h: false, 
      n: 0,
      chunk: null,
      cs: []
    }),
    map(c => c.chunk),
    filter(c => !!c),
    tap(c => {

    }),
  )
  return combineLatest([
    chunks.pipe(first()),
    chunks.pipe(skip(1))
  ]).pipe(
    take(maxDocs/chunkSize),
    map((hCs) => fn(hCs.join('')))
  )

}

exports.loadLinesFlat = async function (path, fn) {
  return (await exports.loadLines(path, fn)).pipe(
    reduce((m, cs) => {m.push(cs); return m}, []),
    map(cs => cs.flat())
  )
}

exports.loadTsv = async function (path) {
  const d3 = await import('d3')
  return exports.loadLines(path, d3.tsvParse)
}

exports.loadTsvFlat = async function (path) {
  const d3 = await import('d3')
  return exports.loadLinesFlat(path, d3.tsvParse)
}

exports.loadCsv = async function (path) {
  const d3 = await import('d3')
  return exports.loadLines(path, d3.csvParse)
}

exports.loadCsvFlat = async function (path) {
  const d3 = await import('d3')
  return exports.loadLinesFlat(path, d3.csvParse)
}