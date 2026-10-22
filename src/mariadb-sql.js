// Keep the shared parameterized queries portable between SQLite and MariaDB.
export function mariaSql(sql) {
  const literals = [];
  const protectedSql = sql.replace(
    /'(?:''|\\.|[^'\\])*'|"(?:""|\\.|[^"\\])*"/g,
    (value) => {
      literals.push(value);
      return "__SQL_LITERAL_" + (literals.length - 1) + "__";
    },
  );
  const translated = protectedSql
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT IGNORE INTO")
    .replace(
      /ON\s+CONFLICT\s*\([^)]*\)\s*DO\s+UPDATE\s+SET/gi,
      "ON DUPLICATE KEY UPDATE",
    )
    .replace(/\bexcluded\.([a-z_][a-z_0-9]*)/gi, "VALUES($1)");
  let previous = "";
  const result = translated.replace(/`[^`]*`|[a-z_][a-z_0-9]*/gi, (token) => {
    if (/^[\w]+$/.test(token)) {
      const word = token.toLowerCase();
      const result =
        word === "end" || (word === "key" && previous !== "duplicate")
          ? "`" + token + "`"
          : token;
      previous = word;
      return result;
    }
    return token;
  });
  return result.replace(
    /__SQL_LITERAL_(\d+)__/g,
    (_, number) => literals[Number(number)],
  );
}
