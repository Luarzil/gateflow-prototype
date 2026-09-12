// Builds the two pages Patrick actually needs:
//
//   review.html  - one landing page with clearly labelled buttons, so there is no chance of
//                  clicking the app link when you wanted the Android download.
//   manual.html  - the operator manual as a readable web page rather than raw Markdown.
//
// Usage: node tools/build-review-pages.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manualSource = path.join(root, "Veri-Gate-V0.8-Operator-Manual.md");

// The two pages do not want identical styling: the review page carries inline video players and
// needs the extra width and the player rules, the manual does not. Passing the difference in keeps
// one shell without either page inheriting rules it has no use for.
const SHELL = (title, subtitle, body, options = {}) => {
  const {
    mainWidth = "820px",
    extraCss = "",
    mobileCss = "a.btn{display:block;text-align:center}",
  } = options;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { --green:#169A5A; --dark:#004B2E; --line:#cbd9d5; --ink:#17241f; --muted:#5b6f68; }
  * { box-sizing: border-box; }
  body { margin:0; background:#eef3f0; color:var(--ink);
         font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  header { background:var(--dark); color:#fff; padding:26px 20px; }
  header .wrap { max-width:820px; margin:0 auto; }
  header h1 { margin:0; font-size:26px; letter-spacing:-.01em; }
  header p { margin:6px 0 0; opacity:.85; font-size:15px; }
  main { max-width:${mainWidth}; margin:0 auto; padding:24px 20px 64px; }
  .card { background:#fff; border:1px solid var(--line); border-radius:10px; padding:20px; margin:0 0 14px; }
  .card h2 { margin:0 0 6px; font-size:19px; }
  .card p { margin:0 0 14px; color:var(--muted); font-size:15px; }
  a.btn { display:inline-block; background:var(--green); color:#fff; text-decoration:none;
          padding:13px 22px; border-radius:8px; font-weight:700; font-size:16px; }
  a.btn.alt { background:#fff; color:var(--dark); border:2px solid var(--dark); }
${extraCss}  .note { background:#fffaf0; border:1px solid #e6d6a8; border-radius:8px; padding:14px 16px;
          margin:18px 0; font-size:15px; }
  h1,h2,h3 { line-height:1.25; }
  h2 { margin:30px 0 10px; font-size:22px; border-bottom:2px solid var(--line); padding-bottom:6px; }
  h3 { margin:22px 0 8px; font-size:17px; color:var(--dark); }
  table { border-collapse:collapse; width:100%; margin:14px 0; font-size:15px; }
  th,td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
  th { background:#e4ece9; }
  code { background:#e4ece9; padding:1px 6px; border-radius:4px; font-size:14px; }
  blockquote { margin:14px 0; padding:10px 16px; border-left:4px solid var(--green);
               background:#fff; color:var(--muted); }
  hr { border:0; border-top:1px solid var(--line); margin:28px 0; }
  ul,ol { padding-left:22px; }
  .back { display:inline-block; margin-bottom:16px; color:var(--dark); font-weight:700; }
  @media (max-width:520px){ ${mobileCss} }
</style>
</head>
<body>
<header><div class="wrap"><h1>${title}</h1><p>${subtitle}</p></div></header>
<main>${body}</main>
</body>
</html>
`;
};

// --- review landing page --------------------------------------------------

const REVIEW_CSS = `  video { display:block; width:100%; aspect-ratio:16/9; margin:14px 0;
          background:#10241f; border-radius:6px; }
  .links { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .text-link { color:var(--dark); font-weight:700; text-underline-offset:3px; }
  details { margin-top:14px; }
  summary { color:var(--dark); font-weight:700; cursor:pointer; }
`;

const REVIEW_MOBILE_CSS =
  "a.btn{display:block;text-align:center;width:100%}.links{display:block}.text-link{display:block;margin-top:12px}";

// The videos play inline on the page. Patrick had trouble with the earlier autoplaying HTML
// slideshows, so each one also gets a plain "open" link and a download, and the captions track
// means the narration is readable with the sound off.
const video = (slug, folder, poster) => `
    <video controls preload="metadata" playsinline poster="docs/media/refresh-v2/${folder}/${poster}">
      <source src="docs/media/refresh-v2/${slug}.mp4" type="video/mp4">
      <track kind="captions" src="docs/media/refresh-v2/${slug}.vtt" srclang="en" label="English">
      Your browser cannot play this video. Use the download link below.
    </video>
    <div class="links"><a class="btn alt" href="docs/media/refresh-v2/${slug}.mp4">Open the video</a><a class="text-link" href="docs/media/refresh-v2/${slug}.mp4" download>Download MP4</a></div>`;

const review = `
  <div class="note">
    <strong>Start here.</strong> Everything for the V0.8 review is on this page. Each button below
    does one thing, so nothing gets clicked by mistake.
  </div>

  <div class="card">
    <h2>1. Install the app on the phone</h2>
    <p>This is the Android file for the XCover. Open this page <strong>on the phone</strong> and tap
    the button. Android will warn you it is from an unknown source — that is normal for any app not
    from the Play Store. Allow it once, then install.</p>
    <a class="btn" href="Veri-Gate-V0.8.apk" download>Download the Android app (4 MB)</a>
  </div>

  <div class="card">
    <h2>2. Watch the customer introduction</h2>
    <p>About two minutes. A modern overview of the gate workflow with new female narration.</p>${video("verigate-customer-v2", "customer", "01.png")}
  </div>

  <div class="card">
    <h2>3. Watch the latest changes walkthrough</h2>
    <p>About two minutes. Shows unknown-vehicle handling, user editing, the single Admin role, and the movement history.</p>${video("verigate-walkthrough-v2", "walkthrough", "01.png")}
    <details><summary>Earlier video editions</summary><p><a class="text-link" href="docs/media/verigate-v08-demo.html">Original changes review</a><br><a class="text-link" href="docs/media/verigate-customer.html">Original customer presentation</a></p></details>
  </div>

  <div class="card">
    <h2>4. Read the manual</h2>
    <p>How the app works, with test values for trying each rule yourself.</p>
    <a class="btn alt" href="manual.html">Open the operator manual</a>
  </div>

  <div class="card">
    <h2>5. Try the app in a browser</h2>
    <p>Runs on a computer with the full supervisor console. On a phone it shows only the scanner.</p>
    <a class="btn alt" href="./">Open Veri-Gate</a>
  </div>

  <div class="note">
    This is a review build. Data is stored on each device only — two phones will not see each
    other's movements yet. The shared database is the next piece of work.
  </div>
`;

// --- manual: convert the Markdown we control ------------------------------

function mdToHtml(md) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  const out = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  let listOpen = null;

  const closeList = () => { if (listOpen) { out.push(`</${listOpen}>`); listOpen = null; } };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { closeList(); i++; continue; }

    if (/^---+$/.test(line.trim())) { closeList(); out.push("<hr>"); i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i++; continue; }

    if (/^>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }

    // table
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1])) {
      closeList();
      const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push("<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table>");
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listOpen !== "ol") { closeList(); out.push("<ol>"); listOpen = "ol"; }
      out.push(`<li>${inline(ol[1])}</li>`); i++; continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listOpen !== "ul") { closeList(); out.push("<ul>"); listOpen = "ul"; }
      out.push(`<li>${inline(ul[1])}</li>`); i++; continue;
    }

    // A wrapped line inside a list belongs to the item above it. Without this the manual's
    // numbered steps restart at 1 after every wrapped line, so "The scanner, step by step"
    // rendered as 1, 2 and then 1, 2 again.
    if (listOpen && /^\s+\S/.test(line)) {
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, ` ${inline(line.trim())}</li>`);
      i++; continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  closeList();
  return out.join("\n");
}

const manualMd = fs.readFileSync(manualSource, "utf8").replace(/^# .*\n/, "");
const manualBody = `<a class="back" href="review.html">&larr; Back to the review page</a>\n` + mdToHtml(manualMd);

fs.writeFileSync(path.join(root, "review.html"),
  SHELL("Veri-Gate V0.8 review", "Everything in one place", review, {
    mainWidth: "920px",
    extraCss: REVIEW_CSS,
    mobileCss: REVIEW_MOBILE_CSS,
  }));
fs.writeFileSync(path.join(root, "manual.html"),
  SHELL("Veri-Gate V0.8 operator manual", "How the app works, and how to try each rule", manualBody));

console.log("wrote review.html and manual.html");
