// Splits a migration file into single statements, because the RDS Data API runs one statement per
// call. Semicolons only end a statement outside a string literal, a dollar-quoted body and a
// comment. The naive split on ";" is how migration 001 broke on the way into Veri-Gate Dev: a
// trailing comment ("soft delete; purge no earlier than +60 days") cut a table in half.
//
// BEGIN and COMMIT are dropped, since the runner wraps each file in its own transaction.

export function splitSql(sql) {
  const statements = [];
  let current = "";
  let index = 0;
  const length = sql.length;

  const finish = () => {
    const statement = current.trim();
    if (statement && !/^(BEGIN|COMMIT)$/i.test(statement)) statements.push(statement);
    current = "";
  };

  while (index < length) {
    const char = sql[index];
    const next = sql[index + 1];

    // Line comment: dropped, but the newline stays, so adjacent string literals keep the line
    // break PostgreSQL needs to join them.
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? length : end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? length : end + 2;
      current += " ";
      continue;
    }

    if (char === "'") {
      let cursor = index + 1;
      while (cursor < length) {
        if (sql[cursor] === "'" && sql[cursor + 1] === "'") { cursor += 2; continue; }
        if (sql[cursor] === "'") break;
        cursor += 1;
      }
      current += sql.slice(index, cursor + 1);
      index = cursor + 1;
      continue;
    }

    if (char === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index));
      if (tag) {
        const close = sql.indexOf(tag[0], index + tag[0].length);
        const stop = close === -1 ? length : close + tag[0].length;
        current += sql.slice(index, stop);
        index = stop;
        continue;
      }
    }

    if (char === ";") {
      finish();
      index += 1;
      continue;
    }

    current += char;
    index += 1;
  }
  finish();
  return statements;
}
