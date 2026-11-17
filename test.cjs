const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  P = require("./core.js");
const header = P.HEADERS.join(",") + "\n";
test("CSV supports BOM, CRLF, quoted commas, escaped quotes and multiline fields", () => {
  assert.deepEqual(
    P.parseCSV('\uFEFFa,b\r\n"x,y","line1\nline2"\r\n"say ""hi""",z'),
    [
      ["a", "b"],
      ["x,y", "line1\nline2"],
      ['say "hi"', "z"],
    ],
  );
});
test("malformed quoting is rejected", () => {
  assert.throws(() => P.parseCSV('a,"b'));
  assert.throws(() => P.parseCSV('a,"b"x'));
  assert.throws(() => P.parseCSV('a,b"c'));
});
test("sample excludes duplicate, impossible date and invalid funnel", () => {
  const r = P.analyze(fs.readFileSync(__dirname + "/sample.csv", "utf8"));
  assert.equal(r.rows.length, 12);
  assert.equal(r.issues.length, 3);
  assert.equal(r.duplicates, 1);
  assert.equal(P.summary(r.rows).conversions, 443);
});
test("weighted rates use totals instead of averaging row rates", () => {
  const r = P.analyze(
    header + "2026-01-01,A,100,50,5,10\n2026-01-02,A,900,90,9,20",
  ).rows;
  assert.equal(P.summary(r).ctr, 0.14);
  assert.equal(P.summary(r).cvr, 0.1);
});
test("zero denominator is unknown, not zero percent", () => {
  const r = P.analyze(header + "2026-01-01,A,0,0,0,0").rows;
  assert.equal(P.summary(r).ctr, null);
  assert.equal(P.summary(r).cpa, null);
  assert.equal(P.format(null, true), "—");
});
test("invalid values rejected and headers validated", () => {
  for (const n of ["-1", "Infinity", "1e5", "", "0.2"])
    assert.equal(
      P.analyze(header + `2026-01-01,A,${n},0,0,0`).issues.length,
      1,
    );
  assert.throws(() => P.analyze("date,date\nx,y"));
});
test("date/channel filter and reversed range", () => {
  const r = P.analyze(
    header + "2026-01-01,A,100,50,5,10\n2026-01-02,B,100,10,1,20",
  ).rows;
  assert.equal(P.filter(r, "B", "2026-01-02", "2026-01-02").length, 1);
  assert.throws(() => P.filter(r, "", "2026-01-03", "2026-01-01"));
});
test("channel names cannot execute spreadsheet formulas on export", () => {
  const r = P.analyze(header + "2026-01-01,=1+1,100,20,2,1").rows;
  assert.match(P.csv(r), /'=1\+1/);
});
test("decimal costs are summed as cents", () => {
  const r = P.analyze(
    header + "2026-01-01,A,100,20,2,0.10\n2026-01-02,A,100,20,2,0.20",
  ).rows;
  assert.equal(P.summary(r).spend, 0.3);
  assert.equal(P.analyze(header + "2026-01-01,A,1,1,1,0.001").issues.length, 1);
});
test("channel grouping handles names matching object prototype keys", () => {
  const r = P.analyze(header + "2026-01-01,__proto__,100,20,2,1").rows;
  assert.equal(P.group(r, "channel")[0].conversions, 2);
});
