function el(tag, text, cls) {
  const x = document.createElement(tag);
  if (text !== undefined) x.textContent = String(text);
  if (cls) x.className = cls;
  return x;
}
function download(name, text, type = "text/plain") {
  const a = el("a");
  const url = URL.createObjectURL(
    new Blob([text], { type: type + ";charset=utf-8" }),
  );
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function notify(text, error = false) {
  const box = document.getElementById("notice");
  box.textContent = text;
  box.className = "notice" + (error ? " error" : "");
  box.hidden = false;
}
function readSmallFile(file, limit = 1000000) {
  if (!file) throw Error("请选择文件");
  if (file.size > limit) throw Error("文件超过 1 MB 限制");
  return file.text();
}
const sample =
  "date,channel,impressions,clicks,conversions,spend\n2026-11-09,小红书,12000,480,36,360.00\n2026-11-09,公众号,8500,340,28,210.00\n2026-11-09,短视频,22000,550,22,440.00\n2026-11-10,小红书,14500,580,45,410.00\n2026-11-10,公众号,9000,405,35,220.00\n2026-11-10,短视频,25000,650,30,480.00\n2026-11-11,小红书,13000,572,44,395.00\n2026-11-11,公众号,8800,396,34,215.00\n2026-11-11,短视频,21000,588,27,420.00\n2026-11-12,小红书,16000,720,61,470.00\n2026-11-12,公众号,10200,490,43,250.00\n2026-11-12,短视频,27000,810,38,510.00\n2026-11-12,小红书,16000,720,61,470.00\n2026-11-13,短视频,900,1200,30,80.00\n2026-02-30,公众号,300,20,1,10.00\n";
let data = null,
  filtered = [];
const source = document.getElementById("csv");
function run() {
  try {
    const next = OpsCore.analyze(source.value);
    data = next;
    const select = document.getElementById("channel");
    select.replaceChildren(el("option", "全部渠道"));
    select.firstChild.value = "";
    [...new Set(data.rows.map((r) => r.channel))].sort().forEach((c) => {
      const x = el("option", c);
      x.value = c;
      select.append(x);
    });
    document.getElementById("from").value = "";
    document.getElementById("to").value = "";
    render();
    notify(
      "已完成检查：" +
        data.rows.length +
        " 行有效，" +
        data.issues.length +
        " 行排除。",
    );
  } catch (e) {
    notify(e.message + "；当前报告仍对应上次成功分析的数据。", true);
  }
}
function table(headers, rows) {
  const t = el("table"),
    head = el("thead"),
    body = el("tbody"),
    tr = el("tr");
  headers.forEach((h) => {
    const th = el("th", h);
    th.scope = "col";
    tr.append(th);
  });
  head.append(tr);
  for (const values of rows) {
    const r = el("tr");
    values.forEach((v) => r.append(el("td", v)));
    body.append(r);
  }
  t.append(head, body);
  return t;
}
function render() {
  if (!data) return;
  try {
    filtered = OpsCore.filter(
      data.rows,
      document.getElementById("channel").value,
      document.getElementById("from").value,
      document.getElementById("to").value,
    );
  } catch (e) {
    filtered = [];
    notify(e.message, true);
    document.getElementById("export").disabled = true;
    document.getElementById("clean").disabled = true;
    document.getElementById("range").textContent = "筛选条件无效";
    document.getElementById("scope").textContent = "请修正日期范围后查看结果。";
    ["stats", "channels", "trend"].forEach((id) =>
      document
        .getElementById(id)
        .replaceChildren(el("p", "日期范围无效，暂无可显示的结果。", "empty")),
    );
    return;
  }
  document.getElementById("notice").hidden = true;
  document.getElementById("export").disabled = !filtered.length;
  document.getElementById("clean").disabled = !filtered.length;
  const s = OpsCore.summary(filtered),
    f = OpsCore.format;
  const stats = document.getElementById("stats");
  stats.replaceChildren();
  [
    ["曝光", f(s.impressions)],
    ["点击率", f(s.ctr, true)],
    ["转化率", f(s.cvr, true)],
    ["转化次数", f(s.conversions)],
    ["花费", f(s.spend)],
    ["每次转化成本", f(s.cpa)],
  ].forEach(([a, b]) => {
    const x = el("div", undefined, "stat");
    x.append(el("span", a), el("strong", b));
    stats.append(x);
  });
  document.getElementById("range").textContent = filtered.length + " 条记录";
  document.getElementById("scope").textContent = filtered.length
    ? "当前筛选：" +
      (document.getElementById("channel").value || "全部渠道") +
      "；" +
      (document.getElementById("from").value || "不限起始") +
      " 至 " +
      (document.getElementById("to").value || "不限结束") +
      "。" +
      (s.impressions < 1000
        ? "曝光样本较小，请谨慎比较比率。"
        : "比较前请确认渠道归因与统计口径一致。")
    : "当前范围没有有效数据。";
  document
    .getElementById("quality")
    .replaceChildren(
      el(
        "p",
        data.total +
          " 行输入 / " +
          data.rows.length +
          " 行有效 / " +
          data.issues.length +
          " 行排除",
        "quality",
      ),
    );
  document.getElementById("channels").replaceChildren(
    filtered.length
      ? table(
          ["渠道", "曝光", "点击率", "转化率", "转化", "转化成本"],
          OpsCore.group(filtered, "channel")
            .sort((a, b) => b.conversions - a.conversions)
            .map((r) => [
              r.name,
              f(r.impressions),
              f(r.ctr, true),
              f(r.cvr, true),
              f(r.conversions),
              f(r.cpa),
            ]),
        )
      : el("p", "没有可比较的记录。", "empty"),
  );
  const trend = document.getElementById("trend");
  trend.replaceChildren();
  const days = OpsCore.group(filtered, "date").sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const max = Math.max(1, ...days.map((d) => d.conversions));
  for (const day of days) {
    const row = el("div", undefined, "trend-row"),
      bar = el("div", undefined, "bar"),
      inner = el("i");
    inner.style.width = (day.conversions / max) * 100 + "%";
    bar.setAttribute("aria-hidden", "true");
    bar.append(inner);
    row.append(el("span", day.name), bar, el("strong", day.conversions));
    trend.append(row);
  }
  if (!days.length) trend.append(el("p", "暂无数据", "empty"));
  document.getElementById("issues").replaceChildren(
    data.issues.length
      ? table(
          ["CSV 记录序号", "排除原因"],
          data.issues.map((i) => [i.row, i.reason]),
        )
      : el("p", "未发现格式或漏斗错误；这不代表业务数据已经核实。", "help"),
  );
}
document.getElementById("analyze").onclick = run;
document.getElementById("demo").onclick = () => {
  source.value = sample;
  run();
};
document.getElementById("file").onchange = async (e) => {
  try {
    source.value = await readSmallFile(e.target.files[0]);
    run();
  } catch (e) {
    notify(e.message, true);
  } finally {
    e.target.value = "";
  }
};
["channel", "from", "to"].forEach(
  (id) => (document.getElementById(id).onchange = render),
);
document.getElementById("export").onclick = () =>
  download(
    "ops-report.md",
    OpsCore.markdown(
      filtered,
      data,
      document.getElementById("scope").textContent,
    ),
    "text/markdown",
  );
document.getElementById("clean").onclick = () =>
  download(
    "cleaned-filtered.csv",
    "\uFEFF" + OpsCore.csv(filtered),
    "text/csv",
  );
source.value = sample;
run();
