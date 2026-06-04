#!/usr/bin/env python3
"""
Twin City Cannabis — dispensary outreach postcards.

Generates print-ready 6x4" mailed postcards, one per dispensary, each with a
QR code that opens THAT shop's live listing. The goal is to warm the lead:
the owner scans, sees their free listing as shoppers do (prices, deals,
hours), and is nudged to claim + verify it.

Input:  outreach/postcards/recipients.json
        [ { "slug": "...", "name": "...", "address": "..." }, ... ]
Output: outreach/postcards/postcards.html
        One front page + one back page per recipient (each @page = one card
        side). Open in a browser and "Save as PDF" / print, or hand the PDF
        to a print shop (VistaPrint, MOO, local).

Run:  python3 scripts/build_postcards.py
      python3 scripts/build_postcards.py --slug unanimous-cannabis   # just one

QR target: https://twincitycannabis.com/dispensaries/<slug>/?src=postcard
The ?src=postcard tag lets you tell card scans apart from organic traffic.
"""

import argparse
import json
import os
import sys
import html
import qrcode
import qrcode.image.svg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POSTCARD_DIR = os.path.join(ROOT, "outreach", "postcards")
SITE = "https://twincitycannabis.com"

# Twin City Cannabis return address — EDIT to your real mailing address.
RETURN_ADDRESS = [
    "Twin City Cannabis",
    "PO Box 0000",
    "Minneapolis, MN 55400",
]


def qr_svg(url):
    """Return an inline <svg> string for the URL (vector = crisp at any size)."""
    img = qrcode.make(
        url,
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=20,
        border=0,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
    )
    # SvgPathImage renders a single <path>; strip the XML header so it inlines.
    raw = img.to_string(encoding="unicode")
    start = raw.find("<svg")
    return raw[start:]


def card_front(d):
    name = html.escape(d["name"])
    return f"""
    <div class="card front">
      <div class="brand">TWIN&nbsp;CITY&nbsp;CANNABIS</div>
      <div class="front-grid">
        <div class="front-copy">
          <h1>{name},<br>you're already on<br>Twin&nbsp;City&nbsp;Cannabis.</h1>
          <p>Scan to see your <b>live listing</b> — the page thousands of
             Minnesota shoppers check for prices, deals &amp; hours.</p>
        </div>
        <div class="front-qr">
          <div class="qr-box">{d["_qr"]}</div>
          <div class="qr-cap">Point your phone camera here</div>
        </div>
      </div>
    </div>
    """


def card_back(d):
    name = html.escape(d["name"])
    # USPS format: street on its own line(s), then "City, ST ZIP" on one line.
    parts = [p.strip() for p in d["address"].split(",") if p.strip()]
    if len(parts) >= 3:
        street = ", ".join(parts[:-2])          # street (+ suite)
        citystatezip = f"{parts[-2]}, {parts[-1]}"
        addr = [d["name"], street, citystatezip]
    else:
        addr = [d["name"]] + parts
    addr_lines = "".join(f"<div>{html.escape(l)}</div>" for l in addr)
    ret = "".join(f"<div>{html.escape(l)}</div>" for l in RETURN_ADDRESS)
    return f"""
    <div class="card back">
      <div class="back-msg">
        <p class="hi">Hey {name} team,</p>
        <p>This is your <b>free</b> listing on Twin City Cannabis — no one set it
           up for you, we built it from public info so local shoppers can find you.</p>
        <p>Scan the QR on the front to make sure your <b>hours, deals, and details
           are right</b>. Then claim it (free, ~2 min) to manage it yourself and
           earn a green <b>&#10003; Verified&nbsp;Owner</b> badge that makes your
           shop stand out.</p>
        <p class="sig">Questions? Just email me.<br>
           — Josh, founder · hello@twincitycannabis.com</p>
        <div class="url">twincitycannabis.com</div>
      </div>
      <div class="back-addr">
        <div class="ret">{ret}</div>
        <div class="stamp">PLACE<br>STAMP<br>HERE</div>
        <div class="to">{addr_lines}</div>
      </div>
    </div>
    """


CSS = """
  @page { size: 6in 4in; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
  .card { width: 6in; height: 4in; overflow: hidden; page-break-after: always; position: relative; }

  /* ---------- FRONT (brand dark green) ---------- */
  .front { background: #0a1410; color: #f5f6f8; padding: 0.3in 0.34in; }
  .front .brand { color: #22c55e; font-size: 9pt; font-weight: 800; letter-spacing: 3px; }
  .front-grid { display: flex; align-items: center; gap: 0.24in; height: 3.05in; margin-top: 0.16in; }
  .front-copy { flex: 1; }
  .front-copy h1 { font-size: 19pt; line-height: 1.12; font-weight: 800; letter-spacing: -0.4px; }
  .front-copy p { margin-top: 0.16in; font-size: 9.5pt; line-height: 1.4; color: #c7ccd2; max-width: 3in; }
  .front-copy b { color: #22c55e; }
  .front-qr { text-align: center; }
  .qr-box { background: #fff; padding: 0.12in; border-radius: 8px; width: 1.7in; height: 1.7in; }
  .qr-box svg { width: 100%; height: 100%; display: block; }
  .qr-cap { margin-top: 0.1in; font-size: 7.5pt; color: #8b909a; letter-spacing: .3px; }

  /* ---------- BACK (white, USPS-friendly) ---------- */
  .back { background: #fff; color: #14201a; display: flex; }
  .back-msg { width: 3.15in; padding: 0.3in 0.26in; border-right: 1px dashed #cdd5d0; }
  .back-msg .hi { font-weight: 700; font-size: 11pt; margin-bottom: 0.08in; }
  .back-msg p { font-size: 8.4pt; line-height: 1.46; margin-bottom: 0.09in; color: #2b3a32; }
  .back-msg b { color: #15803d; }
  .back-msg .sig { margin-top: 0.12in; font-style: italic; color: #4a5a51; }
  .back-msg .url { margin-top: 0.14in; font-weight: 800; color: #15803d; font-size: 9.5pt; letter-spacing: .3px; }
  .back-addr { flex: 1; position: relative; padding: 0.3in; }
  .back-addr .ret { position: absolute; top: 0.26in; left: 0.3in; font-size: 7pt; color: #6b7670; line-height: 1.35; }
  .back-addr .stamp { position: absolute; top: 0.26in; right: 0.3in; width: 0.85in; height: 1in; border: 1px dashed #b8c2bc; border-radius: 4px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 6.5pt; color: #aab4ae; letter-spacing: 1px; }
  .back-addr .to { position: absolute; bottom: 0.62in; right: 0.22in; left: 0.3in; text-align: left; font-size: 10.5pt; line-height: 1.38; color: #14201a; }
  .back-addr .to div:first-child { font-weight: 700; }
"""


def build(recipients):
    cards = []
    for d in recipients:
        url = f"{SITE}/dispensaries/{d['slug']}/?src=postcard"
        d["_qr"] = qr_svg(url)
        cards.append(card_front(d))
        cards.append(card_back(d))
    doc = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>TCC outreach postcards</title>
<style>{CSS}</style></head>
<body>{''.join(cards)}</body></html>"""
    out = os.path.join(POSTCARD_DIR, "postcards.html")
    os.makedirs(POSTCARD_DIR, exist_ok=True)
    with open(out, "w") as f:
        f.write(doc)
    print(f"Wrote {len(recipients)} postcard(s) -> {out}")
    print("Open it in a browser and Save as PDF (6x4in), or send to a printer.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="build only this one slug (prototype)")
    args = ap.parse_args()

    rpath = os.path.join(POSTCARD_DIR, "recipients.json")
    if not os.path.exists(rpath):
        sys.exit(f"Missing {rpath} — create it first.")
    with open(rpath) as f:
        recipients = json.load(f)

    if args.slug:
        recipients = [r for r in recipients if r["slug"] == args.slug]
        if not recipients:
            sys.exit(f"slug {args.slug!r} not in recipients.json")

    build(recipients)


if __name__ == "__main__":
    main()
