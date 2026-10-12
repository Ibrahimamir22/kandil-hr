"""Render this draft's small Markdown subset with Python's standard library."""
from pathlib import Path
import html
import re

ROOT = Path(__file__).resolve().parent


def inline(value):
    value = html.escape(value)
    value = re.sub(r"`([^`]+)`", r"<code>\1</code>", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)
    return re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', value)


lines = (ROOT / "Platform_Blueprint_AR_EN.md").read_text().splitlines()
output = []
i = 0
while i < len(lines):
    line = lines[i]
    if not line.strip():
        i += 1
        continue
    if line.startswith("```"):
        block = []
        i += 1
        while i < len(lines) and not lines[i].startswith("```"):
            block.append(lines[i])
            i += 1
        output.append("<pre><code>" + html.escape("\n".join(block)) + "</code></pre>")
    elif line.startswith("|"):
        rows = []
        while i < len(lines) and lines[i].startswith("|"):
            cells = [x.strip() for x in lines[i].strip("|").split("|")]
            if not all(re.fullmatch(r"[-: ]+", x) for x in cells):
                tag = "th" if not rows else "td"
                rows.append("<tr>" + "".join(f"<{tag}>{inline(x)}</{tag}>" for x in cells) + "</tr>")
            i += 1
        output.append('<div class="table-wrap"><table>' + "".join(rows) + "</table></div>")
        continue
    elif line.startswith("#"):
        level = len(line) - len(line.lstrip("#"))
        output.append(f"<h{level}>" + inline(line[level:].strip()) + f"</h{level}>")
    elif re.match(r"(?:- |\d+\. )", line):
        numbered = not line.startswith("- ")
        tag = "ol" if numbered else "ul"
        items = []
        pattern = r"\d+\. " if numbered else r"- "
        while i < len(lines) and re.match(pattern, lines[i]):
            items.append("<li>" + inline(re.sub("^" + pattern, "", lines[i])) + "</li>")
            i += 1
        output.append(f"<{tag}>" + "".join(items) + f"</{tag}>")
        continue
    else:
        output.append('<p dir="auto">' + inline(line) + "</p>")
    i += 1

page = '''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>قنديل | Platform blueprint</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#22372d;font:15px/1.85 "Segoe UI",Tahoma,Arial,sans-serif}header{background:#143e33;color:white;padding:25px max(24px,calc((100vw - 1050px)/2));display:flex;gap:25px;justify-content:space-between;align-items:center}header strong{font-size:25px}header a{color:#d9e9a8}main{max-width:1100px;margin:28px auto 60px;padding:35px 45px;background:white;border:1px solid #dce3d6;border-radius:15px}h1{font-size:31px;line-height:1.4}h2{font-size:23px;line-height:1.5;margin:40px 0 18px;padding-top:25px;border-top:1px solid #dce3d6}a{color:#1b6550}p{margin:15px 0}li{padding:5px 0}code{font-size:13px;background:#f0f3eb;padding:2px 4px;border-radius:3px}pre{overflow:auto;padding:24px;background:#eff3e9;border-radius:10px;line-height:1.7;font-size:12px}pre code{padding:0}table{width:100%;border-collapse:collapse;font-size:13px;min-width:580px;line-height:1.7}td,th{padding:13px 15px;border:1px solid #dfe6d9;vertical-align:top;text-align:start}th{background:#edf3e8}.table-wrap{overflow:auto;margin:22px 0}button{background:#d9e9a8;color:#183c2d;border:0;padding:10px 15px;border-radius:7px;cursor:pointer;font:inherit}header div{display:flex;gap:18px;align-items:center}@media(max-width:700px){header{padding:20px;flex-wrap:wrap}main{margin:12px;padding:22px 18px}h1{font-size:25px}h2{font-size:20px}}@media print{header{display:none}body{background:white}main{border:0;margin:0;padding:0;max-width:none}h2{break-after:avoid}tr{break-inside:avoid}a{color:inherit}pre{font-size:10px}table{min-width:0}}
</style></head><body><header><strong>قنديل / Design review</strong><div><a href="dist/index.html">Open clickable prototype ↗</a><button onclick="window.print()">Print blueprint</button></div></header><main>'''
(ROOT / "Platform_Blueprint.html").write_text(page + "\n".join(output) + "</main></body></html>")
print("Built Platform_Blueprint.html")
