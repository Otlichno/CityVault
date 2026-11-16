// MariaDB for CityVault: a small stand-in for the parts of the mssql package
// CityVault uses (pool.request().input(...).query(...), transactions,
// recordset/recordsets/rowsAffected), on top of mysql2. CityVault's SQL is
// written for SQL Server; translateSql() rewrites the SQL Server-only parts
// for MariaDB. Strings and quoted names are left alone.
//
// What it rewrites (outside 'strings'):
//   db.dbo.Table, [db].dbo.Table, dbo.Table -> Table (each pool is one database)
//   [Name]                                 -> `Name`
//   @param                                 -> ? (values bound in order)
//   N'text'                                -> 'text'
//   SELECT TOP n / TOP (n) ...             -> SELECT ... LIMIT n
//   OFFSET a ROWS FETCH NEXT b ROWS ONLY   -> LIMIT b OFFSET a
//   ISNULL( -> IFNULL(, NEWID() -> RAND(), GETDATE() -> NOW(),
//   GETUTCDATE() -> UTC_TIMESTAMP(), SYSUTCDATETIME() -> UTC_TIMESTAMP(6),
//   SYSDATETIME() -> NOW(6), SCOPE_IDENTITY() -> LAST_INSERT_ID(),
//   DB_NAME() -> DATABASE(), DATEPART(mm|yy|dd, x) -> MONTH|YEAR|DAY(x)
//   CONVERT(BINARY(n), x)                  -> CAST(x AS BINARY(n))
//   COLLATE SQL_...                        -> (dropped: MariaDB's are case-insensitive)
//   IDENTITY(1,1) -> AUTO_INCREMENT, BIT -> TINYINT(1) (in CREATE TABLE)
//   INFORMATION_SCHEMA: TABLE_SCHEMA = 'dbo' -> TABLE_SCHEMA = DATABASE(),
//     and a query without TABLE_SCHEMA gets one (MariaDB lists every database)
'use strict';

// mysql2 is loaded when a MariaDB pool is made, so translateSql() runs without it.
let mysql = null;

// Splits SQL into code and 'string' / "name" / `name` parts.
function tokens(sql) {
  const out = [];
  let i = 0, start = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === '`') {
      if (i > start) out.push({ code: true, text: sql.slice(start, i) });
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out.push({ code: false, text: sql.slice(i, j + 1) });
      i = start = j + 1;
    } else if (c === '-' && sql[i + 1] === '-') {
      // A comment runs to the end of the line.
      if (i > start) out.push({ code: true, text: sql.slice(start, i) });
      let j = sql.indexOf('\n', i);
      if (j < 0) j = sql.length;
      out.push({ code: false, text: sql.slice(i, j) });
      i = start = j;
    } else {
      i++;
    }
  }
  if (start < sql.length) out.push({ code: true, text: sql.slice(start) });
  return out;
}

// One statement's code (strings already set aside as placeholders).
function rewriteCode(code) {
  let s = code;
  s = s.replace(/(?:\[[^\]\s]+\]|\b\w+)\s*\.\s*dbo\s*\.\s*/gi, '');   // db.dbo.
  s = s.replace(/\[dbo\]\s*\.\s*/gi, '').replace(/\bdbo\s*\.\s*/gi, '');
  s = s.replace(/\[([^\]\r\n]+)\]/g, '`$1`');
  s = s.replace(/\bISNULL\s*\(/gi, 'IFNULL(');
  s = s.replace(/\bNEWID\s*\(\s*\)/gi, 'RAND()');
  s = s.replace(/\bGETUTCDATE\s*\(\s*\)/gi, 'UTC_TIMESTAMP()');
  s = s.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()');
  s = s.replace(/\bSYSUTCDATETIME\s*\(\s*\)/gi, 'UTC_TIMESTAMP(6)');
  s = s.replace(/\bSYSDATETIME\s*\(\s*\)/gi, 'NOW(6)');
  s = s.replace(/\bSCOPE_IDENTITY\s*\(\s*\)/gi, 'LAST_INSERT_ID()');
  s = s.replace(/\bDB_NAME\s*\(\s*\)/gi, 'DATABASE()');
  s = s.replace(/\bDATEPART\s*\(\s*(mm|month|m)\s*,/gi, 'MONTH(')
       .replace(/\bDATEPART\s*\(\s*(yy|yyyy|year)\s*,/gi, 'YEAR(')
       .replace(/\bDATEPART\s*\(\s*(dd|day|d)\s*,/gi, 'DAY(');
  s = s.replace(/\bCONVERT\s*\(\s*(VAR)?BINARY\s*\(\s*(\d+|MAX)\s*\)\s*,\s*([^()]+?)\s*\)/gi,
    (m, v, n, x) => `CAST(${x} AS ${v ? 'VAR' : ''}BINARY${n.toUpperCase() === 'MAX' ? '' : `(${n})`})`);
  s = s.replace(/\s+COLLATE\s+SQL_\w+/gi, '');
  s = s.replace(/\bIDENTITY\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'AUTO_INCREMENT');
  if (/\bCREATE\s+TABLE\b/i.test(s)) s = s.replace(/\bBIT\b/g, 'TINYINT(1)');
  s = s.replace(/\bOFFSET\s+(\S+)\s+ROWS\s+FETCH\s+NEXT\s+(\S+)\s+ROWS\s+ONLY\b/gi, 'LIMIT $2 OFFSET $1');
  return s;
}

// SQL Server SQL -> { text, names } for MariaDB, @params as ? in order.
function translateSql(sql) {
  const parts = tokens(sql);
  // Rewrite code with each string replaced by a placeholder, so patterns
  // that span strings (CONVERT(..., 'x')) still match.
  const strings = [];
  let code = '';
  for (const p of parts) {
    if (p.code) {
      code += p.text;
    } else {
      // N'text' -> 'text'
      if (p.text[0] === "'" && /N$/.test(code) && !/\wN$/.test(code)) code = code.slice(0, -1);
      code += `\u0000${strings.length}\u0000`;
      strings.push(p.text);
    }
  }
  // Statement by statement: TOP needs a LIMIT at the end of its own.
  const statements = code.split(';').map(st => {
    let t = rewriteCode(st);
    const top = t.match(/\bSELECT\s+(DISTINCT\s+)?TOP\s*(\(\s*([^)]+?)\s*\)|(\d+|@\w+))\s*/i);
    if (top) {
      const n = top[3] || top[4];
      t = t.replace(top[0], `SELECT ${top[1] || ''}`);
      t = t.replace(/\s*$/, m => ` LIMIT ${n}${m}`);
    }
    if (/\bINFORMATION_SCHEMA\s*\.\s*(TABLES|COLUMNS)\b/i.test(t)) {
      if (/\bTABLE_SCHEMA\b/i.test(t)) {
        t = t.replace(/\bTABLE_SCHEMA\s*=\s*\u0000(\d+)\u0000/gi, (m, i) =>
          strings[+i].toLowerCase() === "'dbo'" ? 'TABLE_SCHEMA = DATABASE()' : m);
      } else {
        t = t.replace(/\bWHERE\b/i, 'WHERE TABLE_SCHEMA = DATABASE() AND');
      }
    }
    return t;
  });
  code = statements.join(';');
  // @name -> ?, remembering the order (@@ is a MariaDB variable: left alone).
  const names = [];
  code = code.replace(/(^|[^@\w])@(\w+)/g, (m, pre, name) => { names.push(name); return `${pre}?`; });
  const text = code.replace(/\u0000(\d+)\u0000/g, (m, i) => strings[+i]);
  return { text, names };
}

// mysql2's result -> the mssql package's shape.
function shapeResult(res) {
  const one = r => Array.isArray(r)
    ? { rows: r, affected: r.length }
    : { rows: undefined, affected: r && typeof r.affectedRows === 'number' ? r.affectedRows : 0 };
  const multi = Array.isArray(res) && res.length > 0 &&
    (Array.isArray(res[0]) || (res[0] && res[0].constructor && res[0].constructor.name === 'ResultSetHeader'));
  const list = multi ? res.map(one) : [one(res)];
  const recordsets = list.filter(r => r.rows).map(r => r.rows);
  return {
    recordset: recordsets[0] || [],
    recordsets,
    rowsAffected: list.map(r => r.affected),
    output: {}
  };
}

const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

class Request {
  constructor(run) {
    this._run = run;
    this._params = {};
  }
  // input(name, value) or input(name, type, value), as mssql takes it.
  input(name, type, value) {
    this._params[name] = arguments.length >= 3 ? value : type;
    return this;
  }
  async query(sql) {
    const { text, names } = translateSql(sql);
    const values = names.map(n => {
      if (!(n in this._params)) throw new Error(`[DB] SQL parameter @${n} has no value`);
      const v = this._params[n];
      if (v === undefined) return null;
      // ISO times (JSON exports from SQL Server) as Dates: MariaDB refuses
      // the "T...Z" form for a DATETIME.
      if (typeof v === 'string' && ISO_TIME.test(v)) return new Date(v);
      return v;
    });
    const [res] = await this._run(text, values);
    return shapeResult(res);
  }
}

class Transaction {
  constructor(pool) {
    this._pool = pool;
    this._conn = null;
  }
  async begin() {
    this._conn = await this._pool._pool.getConnection();
    await this._conn.beginTransaction();
    return this;
  }
  request() {
    if (!this._conn) throw new Error('[DB] transaction not begun');
    return new Request((t, v) => this._conn.query(t, v));
  }
  async commit() {
    try { await this._conn.commit(); } finally { this._conn.release(); this._conn = null; }
  }
  async rollback() {
    if (!this._conn) return;
    try { await this._conn.rollback(); } finally { this._conn.release(); this._conn = null; }
  }
}

class Pool {
  constructor(cfg) {
    this.engine = 'mariadb';
    this.config = cfg;
    if (!mysql) mysql = require('mysql2/promise');
    this._pool = mysql.createPool({
      host: cfg.server,
      port: cfg.port || 3306,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      charset: 'utf8mb4',
      multipleStatements: true,
      timezone: 'Z',               // DATETIMEs as UTC, like mssql
      supportBigNumbers: true,
      decimalNumbers: true,
      connectionLimit: 10
    });
    // "Name" is a name, as on SQL Server; times are UTC.
    this._pool.pool.on('connection', c => {
      c.query("SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',ANSI_QUOTES'), time_zone = '+00:00'");
    });
  }
  async connect() {
    const conn = await this._pool.getConnection();
    conn.release();
    return this;
  }
  request() {
    return new Request((t, v) => this._pool.query(t, v));
  }
  transaction() {
    return new Transaction(this);
  }
  async close() {
    await this._pool.end();
  }
}

module.exports = { Pool, Request, Transaction, translateSql, shapeResult };
