(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OpsCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const HEADERS = [
    "date",
    "channel",
    "impressions",
    "clicks",
    "conversions",
    "spend",
  ];
  function parseCSV(source) {
    if (typeof source !== "string" || source.length > 1000000)
      throw Error("CSV 必须小于 1 MB");
    let text = source
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
    let rows = [],
      row = [],
      field = "",
      quoted = false,
      closed = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else field += c;
      } else if (c === ",") {
        row.push(field);
        field = "";
        closed = false;
      } else if (c === "\n") {
        row.push(field);
        if (row.some((x) => x !== "")) rows.push(row);
        row = [];
        field = "";
        closed = false;
      } else if (c === '"') {
        if (field !== "" || closed) throw Error("引号必须从字段开头开始");
        quoted = true;
      } else {
        if (closed) throw Error("结束引号后只能是逗号或换行");
        field += c;
      }
    }
    if (quoted) throw Error("CSV 中存在未闭合的引号");
    row.push(field);
    if (row.some((x) => x !== "")) rows.push(row);
    if (rows.length > 10001) throw Error("最多支持 10,000 行数据");
    return rows;
  }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + "T00:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s;
  }
  function analyze(source) {
    const table = parseCSV(source);
    if (table.length < 1) throw Error("CSV 为空");
    const headers = table.shift().map((x) => x.trim());
    if (
      headers.length !== 6 ||
      new Set(headers).size !== 6 ||
      !HEADERS.every((h) => headers.includes(h))
    )
      throw Error("表头必须包含且仅包含：" + HEADERS.join(", "));
    const rows = [],
      issues = [],
      seen = new Set();
    let duplicates = 0;
    table.forEach((values, i) => {
      const rowNumber = i + 2;
      try {
        if (values.length !== 6) throw Error("字段数应为 6");
        const r = Object.fromEntries(
          headers.map((h, j) => [h, values[j].trim()]),
        );
        if (!validDate(r.date)) throw Error("日期无效");
        if (!r.channel || r.channel.length > 100)
          throw Error("渠道名为空或超过 100 个字符");
        for (const k of HEADERS.slice(2)) {
          const raw = r[k];
          if (!/^\d+(\.\d+)?$/.test(raw)) throw Error(k + " 必须是非负数字");
          r[k] = Number(raw);
          if (!Number.isFinite(r[k]) || r[k] > 1000000000000)
            throw Error(k + " 数值过大");
          if (k !== "spend" && !Number.isSafeInteger(r[k]))
            throw Error(k + " 必须是整数");
          if (k === "spend" && /\.\d{3,}$/.test(raw))
            throw Error("spend 最多保留两位小数");
        }
        if (r.clicks > r.impressions || r.conversions > r.clicks)
          throw Error("漏斗不一致：转化 ≤ 点击 ≤ 曝光");
        const key = JSON.stringify([r.date, r.channel]);
        if (seen.has(key)) {
          duplicates++;
          throw Error("日期与渠道重复：保留首条有效数据");
        }
        seen.add(key);
        rows.push(r);
      } catch (e) {
        issues.push({ row: rowNumber, reason: e.message });
      }
    });
    return { rows, issues, total: table.length, duplicates };
  }
  const ratio = (a, b) => (b === 0 ? null : a / b);
  function summary(rows) {
    const out = { impressions: 0, clicks: 0, conversions: 0, spend: 0 };
    let cents = 0;
    for (const r of rows) {
      for (const k of ["impressions", "clicks", "conversions"]) out[k] += r[k];
      cents += Math.round(r.spend * 100);
    }
    out.spend = cents / 100;
    return {
      ...out,
      ctr: ratio(out.clicks, out.impressions),
      cvr: ratio(out.conversions, out.clicks),
      cpa: ratio(out.spend, out.conversions),
    };
  }
  function group(rows, key) {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r[key])) map.set(r[key], []);
      map.get(r[key]).push(r);
    }
    return [...map].map(([name, rs]) => ({ name, ...summary(rs) }));
  }
  function filter(rows, channel = "", from = "", to = "") {
    if ((from && !validDate(from)) || (to && !validDate(to)))
      throw Error("筛选日期无效");
    if (from && to && from > to) throw Error("开始日期不能晚于结束日期");
    return rows.filter(
      (r) =>
        (!channel || r.channel === channel) &&
        (!from || r.date >= from) &&
        (!to || r.date <= to),
    );
  }
  function cell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csv(rows) {
    return (
      HEADERS.join(",") +
      "\n" +
      rows.map((r) => HEADERS.map((k) => cell(r[k])).join(",")).join("\n")
    );
  }
  function format(v, percent = false) {
    return v === null
      ? "—"
      : percent
        ? (v * 100).toFixed(2) + "%"
        : v.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  }
  function markdown(rows, quality, scope) {
    const s = summary(rows);
    return [
      "# 运营数据分析报告",
      "",
      scope,
      "",
      `有效记录：${rows.length}；原始数据排除：${quality.issues.length} 行。`,
      "",
      "## 汇总",
      `- 曝光：${format(s.impressions)}`,
      `- 点击：${format(s.clicks)}`,
      `- 转化：${format(s.conversions)}`,
      `- 花费：${format(s.spend)}`,
      `- 点击率：${format(s.ctr, true)}`,
      `- 转化率：${format(s.cvr, true)}`,
      `- 每次转化成本：${format(s.cpa)}`,
      "",
      "## 渠道",
      ...group(rows, "channel").map(
        (r) =>
          `- ${r.name}：点击率 ${format(r.ctr, true)}；转化率 ${format(r.cvr, true)}；转化 ${r.conversions}；每次转化成本 ${format(r.cpa)}`,
      ),
      "",
      "## 数据质量",
      ...quality.issues.map((i) => `- 记录 ${i.row}：${i.reason}`),
      "",
      "## 解读边界",
      "- 比率为总量相除；零分母显示 —。",
      "- 示例为模拟数据，不代表真实业绩。",
      "- 转化不能证明因果；渠道归因、币种、时间口径须人工核对。",
      "- CSV 导出为防止电子表格公式执行，会给特殊开头的文本加单引号。",
    ].join("\n");
  }
  return {
    HEADERS,
    parseCSV,
    analyze,
    summary,
    group,
    filter,
    csv,
    format,
    markdown,
  };
});
