import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import initSqlJs from 'sql.js/dist/sql-wasm-inline.js'

const SQL = await initSqlJs()

export function openStorage(path) {
  const memory = path === ':memory:'
  if (!memory) {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(`${path}-wal`) && statSync(`${path}-wal`).size > 0) {
      throw new Error('SQLite WAL contains pending data; checkpoint with the previous runtime before opening')
    }
  }
  const existing = !memory && existsSync(path) ? readFileSync(path) : undefined
  if (existing && existing.subarray(0, 16).toString('ascii') !== 'SQLite format 3\0') throw new Error('Invalid SQLite database file')
  const sqlite = new SQL.Database(existing)
  let inTransaction = false
  let healthy = true

  function assertHealthy() {
    if (!healthy) throw Object.assign(new Error('SQLite storage is unavailable'), { code: 'SQLITE_STORAGE_UNAVAILABLE' })
  }

  function persist() {
    if (memory) return
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`
    let fd
    try {
      const bytes = Buffer.from(sqlite.export())
      fd = openSync(temp, 'wx', 0o600)
      writeFileSync(fd, bytes)
      fsyncSync(fd)
      closeSync(fd)
      fd = undefined
      renameSync(temp, path)
    } catch (error) {
      healthy = false
      if (fd !== undefined) closeSync(fd)
      rmSync(temp, { force: true })
      throw Object.assign(new Error('SQLite persistence failed', { cause: error }), { code: 'SQLITE_STORAGE_UNAVAILABLE' })
    }
  }

  return {
    exec(sql) {
      assertHealthy()
      const command = sql.trim().split(/\s+/)[0].toUpperCase()
      sqlite.exec(sql)
      if (command === 'BEGIN') inTransaction = true
      else if (command === 'ROLLBACK') inTransaction = false
      else if (command === 'COMMIT') { inTransaction = false; persist() }
      else if (!inTransaction) persist()
    },
    prepare(sql) {
      return {
        run(...params) {
          assertHealthy()
          sqlite.run(sql, params)
          if (!inTransaction) persist()
        },
        get(...params) {
          assertHealthy()
          const statement = sqlite.prepare(sql)
          try {
            statement.bind(params)
            return statement.step() ? statement.getAsObject() : undefined
          } finally { statement.free() }
        },
      }
    },
    close() { sqlite.close() },
  }
}
