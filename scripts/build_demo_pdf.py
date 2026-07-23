#!/usr/bin/env python
"""Render DEMO_GUIDE.md into a presentation-styled HTML file (demo-guide.html).

Run with the project venv:  .venv-pdf/Scripts/python scripts/build_demo_pdf.py
Then print to PDF with headless Edge/Chrome (see README or the npm script).
"""

from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
MD = ROOT / "DEMO_GUIDE.md"
SVG = ROOT / "iie_cloudflare_architecture.svg"
OUT = ROOT / "demo-guide.html"

body = markdown.markdown(
    MD.read_text(encoding="utf-8"),
    extensions=["tables", "fenced_code", "sane_lists"],
)

# Inline the architecture diagram right after the opening pitch section.
svg = SVG.read_text(encoding="utf-8")
svg = svg[svg.index("<svg"):]  # drop any XML prolog
figure = f"""
<figure class="arch">
  {svg}
  <figcaption>System architecture — source subsystems publish canonical events into the unified log; mining and the dashboard consume it.</figcaption>
</figure>
"""
marker = "<h2>2. Pre-demo checklist"
idx = body.find(marker)
if idx != -1:
    body = body[:idx] + figure + body[idx:]
else:
    raise SystemExit("insertion point for architecture figure not found")

CSS = """
@page { size: A4; margin: 16mm 14mm 18mm 14mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", system-ui, sans-serif; color: #1e293b; font-size: 10.5pt; line-height: 1.5; margin: 0; }

h1 { font-size: 24pt; color: #0f172a; margin: 0 0 2mm; letter-spacing: -0.5px; }
h1 + p { font-size: 10pt; color: #475569; background: #f1f5f9; border-radius: 6px; padding: 3mm 4mm; }
h1 + p strong { color: #0f172a; }

h2 { break-before: page; font-size: 14.5pt; color: #ffffff; background: #0f172a; border-radius: 6px;
     padding: 2.5mm 4mm; margin: 0 0 4mm; }
h2:first-of-type { break-before: avoid; margin-top: 5mm; }
h2 + p, h2 + ul, h2 + ol, h2 + table, h2 + pre, h2 + figure, h2 + blockquote { break-before: avoid; }
h3 { font-size: 11.5pt; color: #4338ca; margin: 5mm 0 1.5mm; }

blockquote { margin: 3mm 0; padding: 3mm 4mm; background: #eef2ff; border-left: 4px solid #4f46e5;
             border-radius: 0 6px 6px 0; color: #312e81; font-style: italic; }
blockquote p { margin: 0; }

code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; background: #f1f5f9;
       padding: 0.5px 4px; border-radius: 3px; color: #0f172a; }
pre { background: #0f172a; color: #e2e8f0; border-radius: 6px; padding: 3mm 4mm; overflow-x: auto;
      break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 9pt; }

table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; break-inside: avoid; }
th { background: #0f172a; color: #fff; text-align: left; padding: 2mm 3mm; font-size: 9pt;
     text-transform: uppercase; letter-spacing: 0.4px; }
td { border-bottom: 1px solid #e2e8f0; padding: 1.8mm 3mm; vertical-align: top; }
tr:nth-child(even) td { background: #f8fafc; }

ul, ol { margin: 2mm 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
p { margin: 2mm 0; }
strong { color: #0f172a; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 4mm 0; }
a { color: #4f46e5; text-decoration: none; }

figure.arch { margin: 4mm 0; padding: 3mm; border: 1px solid #e2e8f0; border-radius: 6px;
              background: #fff; break-inside: avoid; text-align: center; }
figure.arch svg { max-width: 100%; height: auto; }
figcaption { font-size: 8.5pt; color: #64748b; margin-top: 2mm; }
"""

html = f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>IIE Demonstration Guide</title><style>{CSS}</style></head>
<body>
{body}
</body>
</html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"wrote {OUT}")
