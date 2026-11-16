// node tests/mariadb-sql.test.js: CityVault's SQL Server SQL as MariaDB
// takes it (db/mariadb.js translateSql). No database needed.
'use strict';
const assert = require('assert');
const { translateSql, shapeResult } = require('../db/mariadb');

const cases = [
  ['SELECT email, tracker FROM dbo.user_account WHERE account = @account',
   'SELECT email, tracker FROM user_account WHERE account = ?', ['account']],
  ['SELECT account, role FROM cohauth.dbo.user_account WHERE account = @username',
   'SELECT account, role FROM user_account WHERE account = ?', ['username']],
  ['SELECT DISTINCT AuthId FROM [cohdb_Play].dbo.Ents WHERE Name COLLATE SQL_Latin1_General_CP1_CI_AS LIKE @search',
   'SELECT DISTINCT AuthId FROM Ents WHERE Name LIKE ?', ['search']],
  ['UPDATE dbo.user_auth SET password = CONVERT(BINARY(128), @password) WHERE account = @account',
   'UPDATE user_auth SET password = CAST(? AS BINARY(128)) WHERE account = ?', ['password', 'account']],
  ['SELECT ISNULL(MAX(uid), 0) + 1 AS newID FROM dbo.user_account',
   'SELECT IFNULL(MAX(uid), 0) + 1 AS newID FROM user_account', []],
  ['SELECT TOP 1 * FROM dbo.Costumes', 'SELECT * FROM Costumes LIMIT 1', []],
  ['SELECT TOP (50) ContainerId, CurrentCostume FROM dbo.Ents WHERE CurrentCostume IS NOT NULL ORDER BY NEWID()',
   'SELECT ContainerId, CurrentCostume FROM Ents WHERE CurrentCostume IS NOT NULL ORDER BY RAND() LIMIT 50', []],
  ['SELECT TOP 9 e.Name FROM dbo.Ents e WHERE e.AccessLevel <= @maxAccess ORDER BY e.LastActive DESC\n',
   'SELECT e.Name FROM Ents e WHERE e.AccessLevel <= ? ORDER BY e.LastActive DESC LIMIT 9\n', ['maxAccess']],
  ['SELECT ua.uid FROM cohauth.dbo.user_account ua ORDER BY ua.account OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY',
   'SELECT ua.uid FROM user_account ua ORDER BY ua.account LIMIT ? OFFSET ?', ['limit', 'offset']],
  ["SELECT * FROM dbo.[Badges] WHERE ContainerId = @id", 'SELECT * FROM `Badges` WHERE ContainerId = ?', ['id']],
  ["SELECT COUNT(*) AS existsCheck FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Ents'",
   "SELECT COUNT(*) AS existsCheck FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Ents'", []],
  ["SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @table AND TABLE_SCHEMA = 'dbo'",
   'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = ? AND TABLE_SCHEMA = DATABASE()', ['table']],
  ['INSERT INTO Ents (Name) VALUES (@name); SELECT SCOPE_IDENTITY() AS newId',
   'INSERT INTO Ents (Name) VALUES (?); SELECT LAST_INSERT_ID() AS newId', ['name']],
  ['SELECT DB_NAME() AS db', 'SELECT DATABASE() AS db', []],
  ['WHERE DATEPART(mm, e.DateCreated) = @month', 'WHERE MONTH( e.DateCreated) = ?', ['month']],
  ['CREATE TABLE cohauth.dbo.user_notes ( id INT IDENTITY(1,1) PRIMARY KEY, created_at DATETIME DEFAULT GETUTCDATE(), is_admin BIT NOT NULL DEFAULT 0 );',
   'CREATE TABLE user_notes ( id INT AUTO_INCREMENT PRIMARY KEY, created_at DATETIME DEFAULT UTC_TIMESTAMP(), is_admin TINYINT(1) NOT NULL DEFAULT 0 );', []],
  // Strings stay as they are: @, dbo., [x], TOP inside them.
  ["SELECT 'me@x.com dbo.y [z] TOP 3' AS s, @a FROM t WHERE n = N'Ünï'",
   "SELECT 'me@x.com dbo.y [z] TOP 3' AS s, ? FROM t WHERE n = 'Ünï'", ['a']],
  // A parameter used twice is bound twice.
  ['VALUES (@username, @uid, @uid, 1014)', 'VALUES (?, ?, ?, 1014)', ['username', 'uid', 'uid']],
  ['UPDATE t SET block_flag = block_flag & ~2 WHERE uid = @uid', 'UPDATE t SET block_flag = block_flag & ~2 WHERE uid = ?', ['uid']],
];

let failed = 0;
for (const [input, text, names] of cases) {
  const got = translateSql(input);
  try {
    assert.strictEqual(got.text, text);
    assert.deepStrictEqual(got.names, names);
    console.log('ok:', input.slice(0, 70).replace(/\s+/g, ' '));
  } catch (e) {
    failed++;
    console.log('FAILED:', input, '\n  got: ', got.text, got.names, '\n  want:', text, names);
  }
}

// mysql2 results in the mssql package's shape.
{
  const rows = [{ a: 1 }];
  const r = shapeResult(rows);
  assert.deepStrictEqual(r.recordset, rows);
  assert.deepStrictEqual(r.rowsAffected, [1]);
  class ResultSetHeader { constructor() { this.affectedRows = 3; this.insertId = 7; } }
  const m = shapeResult([new ResultSetHeader(), [{ newId: 7 }]]);
  assert.deepStrictEqual(m.recordsets, [[{ newId: 7 }]]);
  assert.deepStrictEqual(m.rowsAffected, [3, 1]);
  const u = shapeResult(new ResultSetHeader());
  assert.deepStrictEqual(u.recordset, []);
  assert.deepStrictEqual(u.rowsAffected, [3]);
  console.log('ok: result shapes');
}

if (failed) {
  console.log(`${failed} case(s) failed`);
  process.exit(1);
}
console.log('MariaDB SQL: all checks passed');
