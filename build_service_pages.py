#!/usr/bin/env python3
"""Generate answer-first local service pages for maniginam.dev (GEO/AEO).
Each targets a real prospect question so AI engines can cite a specific answer.
Writes to services/<slug>.html + returns paths for sitemap/nav wiring.
"""
import html, os, json

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "services")
os.makedirs(OUT, exist_ok=True)

PAGES = [
    {
        "slug": "custom-software-developer-port-allen",
        "title": "Custom Software Developer in Port Allen, LA",
        "desc": "Need a custom software developer near Port Allen or West Baton Rouge? Gina Martiny (ManiGinaM, LLC) builds custom software, automations, and web apps for Louisiana businesses — local, in person, and woman-owned.",
        "h1": "Custom software developer in Port Allen, Louisiana",
        "answer": "Yes — if you're a business in Port Allen, Brusly, or anywhere in West Baton Rouge Parish that needs custom software built, <strong>ManiGinaM, LLC (Gina Martiny)</strong> is a local software engineer who does exactly that. Custom apps, internal tools, automations, and integrations — built and supported in person, right here in the parish.",
        "sections": [
            ("What I build", "<ul><li><strong>Custom applications &amp; internal tools</strong> — replace spreadsheets and manual processes with software that fits how you actually work.</li><li><strong>Automations &amp; integrations</strong> — connect the systems you already use so data stops getting re-typed.</li><li><strong>Web apps &amp; customer portals</strong> — ordering, booking, dashboards, member areas.</li><li><strong>Industrial &amp; plant software</strong> — modernizing legacy systems, bridging chemical-manufacturing and software (my background).</li></ul>"),
            ("Why local matters", "You get a real person in West Baton Rouge who shows up, understands the parish, and sticks around to support what she builds — not an offshore ticket queue or a national agency that forgets you after launch. Woman-owned, WBR Chamber member."),
        ],
        "faqs": [
            ("Do you work with small businesses in West Baton Rouge?", "Yes — small local businesses are exactly who I build for, across Port Allen, Brusly, Addis, and greater Baton Rouge."),
            ("How much does custom software cost?", "It depends on scope, but small automations and tools often start in the low four figures. I'll give you a fixed estimate before any work begins — no surprises."),
            ("Do you only do custom software, or websites too?", "Both — custom software, web applications, and website design/rescue. Many local clients start with a website or online-ordering fix and grow into custom tools."),
        ],
    },
    {
        "slug": "fix-small-business-website-west-baton-rouge",
        "title": "Fix a Small-Business Website in West Baton Rouge, LA",
        "desc": "Broken, slow, or outdated website for your Port Allen / West Baton Rouge business? ManiGinaM (Gina Martiny) fixes broken links, adds online ordering, and makes local sites actually bring in customers.",
        "h1": "Fix or rebuild your small-business website — West Baton Rouge",
        "answer": "If your business website in Port Allen or West Baton Rouge is broken, slow, missing on mobile, or just not bringing in customers, <strong>ManiGinaM, LLC (Gina Martiny)</strong> is a local web developer who fixes exactly that — broken links, dead contact buttons, missing online ordering, and outdated designs — usually fast, and in person.",
        "sections": [
            ("Common things I fix for local businesses", "<ul><li><strong>Broken links &amp; dead \"call/contact\" buttons</strong> that quietly lose you customers.</li><li><strong>No online ordering or booking</strong> — capture the sales you're missing after hours.</li><li><strong>Not mobile-friendly / slow</strong> — most of your visitors are on a phone.</li><li><strong>Photos that don't load</strong> — for a restaurant or shop, the pictures are the sell.</li></ul>"),
            ("How it works", "I look at your site, tell you plainly what's costing you customers, and give a fixed price to fix it. Quick fixes are often same-week. I'm local — you can meet me in person, not just email a ticket."),
        ],
        "faqs": [
            ("My website builder site is broken — can you fix it without rebuilding everything?", "Usually yes. Many issues (broken buttons, missing photos, no ordering) are quick fixes on your existing site. I'll only recommend a rebuild if it's genuinely cheaper long-term."),
            ("Can you add online ordering to my restaurant or shop site?", "Yes — online ordering and catering-request forms are one of the highest-ROI things I add for local food businesses."),
            ("Where are you located?", "Port Allen, LA — serving all of West Baton Rouge Parish, Brusly, Addis, and greater Baton Rouge."),
        ],
    },
    {
        "slug": "ai-automation-baton-rouge",
        "title": "AI Automation & Integration for Baton Rouge Businesses",
        "desc": "Practical AI integration and automation for businesses in Baton Rouge and West Baton Rouge — ManiGinaM (Gina Martiny) automates the busywork without the hype, including for industrial and manufacturing operations.",
        "h1": "AI automation &amp; integration for Baton Rouge businesses",
        "answer": "If you're a business in the Baton Rouge area looking to actually <em>use</em> AI — not just hear about it — <strong>ManiGinaM, LLC (Gina Martiny)</strong> is a local AI consultant and software engineer who integrates practical AI into real workflows: automating repetitive work, speeding up back-office tasks, and connecting AI to the systems you already run.",
        "sections": [
            ("Practical AI, not hype", "<ul><li><strong>Automate the busywork</strong> — data entry, document handling, routing, summaries.</li><li><strong>AI in your existing tools</strong> — not a rip-and-replace; AI wired into what you already use.</li><li><strong>Industrial &amp; manufacturing</strong> — my background bridges chemical manufacturing and software, so I speak plant-floor and code.</li></ul>"),
            ("Why work with a local engineer", "I'll tell you honestly where AI helps and where it doesn't — and I build the integration myself, keeping the human judgment where it belongs. Local, in West Baton Rouge, and accountable for what I ship."),
        ],
        "faqs": [
            ("Is AI worth it for a small or mid-size Louisiana business?", "For the right tasks, yes — mostly repetitive, high-volume work. I'll scope one concrete win first so you see ROI before investing further."),
            ("Do you do AI for industrial or manufacturing operations?", "Yes. My background is bridging chemical manufacturing and software engineering, including modernizing legacy industrial systems."),
            ("Are you local to Baton Rouge?", "Yes — based in Port Allen, LA (West Baton Rouge Parish), serving the greater Baton Rouge area in person."),
        ],
    },
]

STYLE = """
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--navy:#1e1e2e;--accent:#ff8a8a;--coral:#ff4030;--lilac:#c4a0ff;--lilac2:#b026ff;--text:#e8e8f0;--mut:#9999aa;--bg:#1e1e2e;--panel:#26262f;--border:#33334a;--disp:'Space Grotesk','Inter',sans-serif}
html{scroll-behavior:smooth}body{font-family:'Inter',-apple-system,sans-serif;color:var(--text);background:var(--bg);line-height:1.8;-webkit-font-smoothing:antialiased}
nav{position:fixed;top:0;left:0;right:0;z-index:100;background:var(--navy);height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 2rem;box-shadow:0 1px 4px rgba(0,0,0,.15)}
nav .logo{font-family:var(--disp);font-size:1.4rem;font-weight:700;text-decoration:none;display:flex}
nav .logo .lg-mani{color:#8a8b98}nav .logo .lg-gina{color:var(--lilac2)}nav .logo .lg-m{color:var(--coral)}
nav ul{list-style:none;display:flex;gap:1.6rem}nav ul li a{color:rgba(255,255,255,.8);text-decoration:none;font-size:.875rem;font-weight:500}
nav ul li a:hover{color:var(--accent)}
.hero{margin-top:60px;background:linear-gradient(180deg,#26263a,#1e1e2e);padding:3.4rem 2rem 2.2rem;text-align:center}
.eyebrow{font-size:.72rem;letter-spacing:.24em;text-transform:uppercase;color:#8fb9a8;font-weight:700}
h1{font-family:var(--disp);font-weight:700;font-size:2.1rem;color:#fff;max-width:760px;margin:.6rem auto 0;line-height:1.12}
.wrap{max-width:720px;margin:0 auto;padding:2.4rem 2rem 3rem}
.answer{font-size:1.2rem;line-height:1.7;background:var(--panel);border-left:3px solid var(--coral);border-radius:0 10px 10px 0;padding:1.1rem 1.3rem;color:#eceaf2}
.answer strong{color:#fff}.answer em{color:var(--lilac)}
h2{font-family:var(--disp);font-size:1.35rem;color:var(--lilac);margin:2.2rem 0 .8rem;font-weight:700}
p{margin:.9rem 0;font-size:1.08rem}ul{margin:.6rem 0 1rem 1.3rem}li{margin:.45rem 0;font-size:1.04rem}
.faq{margin-top:1rem}.faq details{border-bottom:1px solid var(--border);padding:.9rem 0}
.faq summary{font-family:var(--disp);font-weight:600;font-size:1.05rem;color:#fff;cursor:pointer;list-style:none}
.faq summary::marker{display:none}.faq summary::before{content:'+ ';color:var(--coral)}
.faq details[open] summary::before{content:'– '}
.faq p{color:var(--mut);margin:.6rem 0 0}
.cta{margin-top:2.4rem;background:linear-gradient(135deg,rgba(176,38,255,.14),rgba(255,64,48,.10));border:1px solid var(--border);border-radius:14px;padding:1.4rem 1.5rem;text-align:center}
.cta .k{font-family:var(--disp);font-size:1.2rem;color:#fff;font-weight:700}
.cta a{color:var(--coral);text-decoration:none;font-weight:700}.cta .ph{font-size:1.15rem;margin-top:.5rem;display:block}
a.home{color:var(--lilac);text-decoration:none;font-size:.9rem}
footer{background:var(--navy);text-align:center;padding:1.5rem 2rem;color:rgba(255,255,255,.55);font-size:.8rem;border-top:1px solid var(--border)}
"""

NAV = ('<nav><a class="logo" href="/"><span class="lg-mani">Mani</span><span class="lg-gina">Gina</span>'
       '<span class="lg-m">M</span></a><ul><li><a href="/">Home</a></li><li><a href="/#services">Services</a></li>'
       '<li><a href="/blog/">Blog</a></li><li><a href="/#contact">Contact</a></li></ul></nav>')


def page_html(p):
    url = f"https://maniginam.dev/services/{p['slug']}"
    faq_ld = {"@context": "https://schema.org", "@type": "FAQPage",
              "mainEntity": [{"@type": "Question", "name": q,
                              "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in p["faqs"]]}
    svc_ld = {"@context": "https://schema.org", "@type": "Service", "serviceType": p["title"],
              "areaServed": ["West Baton Rouge Parish", "Baton Rouge", "Louisiana"],
              "provider": {"@type": "LocalBusiness", "@id": "https://maniginam.dev/#business",
                           "name": "ManiGinaM, LLC", "telephone": "(225) 366-8116",
                           "address": {"@type": "PostalAddress", "addressLocality": "Port Allen", "addressRegion": "LA"}},
              "url": url}
    secs = "".join(f"<h2>{html.escape(t)}</h2><div>{body}</div>" for t, body in p["sections"])
    faqs_html = "".join(f"<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>" for q, a in p["faqs"])
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(p['title'])} — ManiGinaM</title>
<meta name="description" content="{html.escape(p['desc'])}">
<meta name="robots" content="index, follow"><link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:title" content="{html.escape(p['title'])}">
<meta property="og:description" content="{html.escape(p['desc'])}"><meta property="og:url" content="{url}">
<meta property="og:image" content="https://maniginam.dev/img/og-card.png?v=2">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">{json.dumps(faq_ld)}</script>
<script type="application/ld+json">{json.dumps(svc_ld)}</script>
<style>{STYLE}</style></head><body>
{NAV}
<header class="hero"><div class="eyebrow">Port Allen · West Baton Rouge · Louisiana</div><h1>{p['h1']}</h1></header>
<main class="wrap">
  <div class="answer">{p['answer']}</div>
  {secs}
  <h2>Frequently asked questions</h2>
  <div class="faq">{faqs_html}</div>
  <div class="cta"><div class="k">Ready to talk? I'm local and I answer.</div>
    <span class="ph">☎ <a href="tel:2253668116">(225) 366-8116</a> &nbsp;·&nbsp; ✉ <a href="mailto:gina@maniginam.dev">gina@maniginam.dev</a></span>
    <p style="margin-top:.8rem"><a class="home" href="/">← Back to maniginam.dev</a></p></div>
</main>
<footer>ManiGinaM, LLC — West Baton Rouge Parish's Software Engineer · Port Allen, LA · Proud member, WBR Chamber of Commerce</footer>
</body></html>"""


if __name__ == "__main__":
    for p in PAGES:
        open(os.path.join(OUT, p["slug"] + ".html"), "w").write(page_html(p))
        print("  wrote services/" + p["slug"] + ".html")
    print("done — " + str(len(PAGES)) + " pages")
