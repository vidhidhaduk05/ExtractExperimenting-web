from pathlib import Path
import re, math

source = Path(r'D:\Desktop\Website for software\version_2_website_portable.html')
html = source.read_text(encoding='utf-8')
css = '''
/* Royal edition: the original parchment and earthy color tokens are retained. */
body { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%239c9487' opacity='.055' filter='url(%23n)' d='M0 0h160v160H0z'/%3E%3C/svg%3E"); }
.site-header {background:transparent; padding:12px 0 0;}
.site-header-inner {max-width:1440px; padding:22px 42px; border-top:1px solid var(--ink-faint); border-bottom:3px double var(--ink-faint); margin:0 32px;}
.logo-mark {background:transparent; border:1px solid var(--ochre); border-radius:0; transform:rotate(45deg); width:31px; height:31px;}
.logo-mark-inner {color:var(--ink-black); transform:rotate(-45deg); font-size:24px;}
.logo-wordmark {font-size:30px; font-weight:500; letter-spacing:-1px; margin-left:6px;}
.site-header-link {font-family:'Space Mono',monospace; font-size:10px; text-transform:uppercase; letter-spacing:.08em; padding:8px 10px;}
.header-divider {background:var(--divider);}
.btn-solid,.btn-outline,.btn-pill,.btn-pricing-ghost,.btn-pricing-solid {border-radius:0!important; font-family:'Space Mono',monospace; font-size:11px; letter-spacing:.07em; text-transform:uppercase; padding:15px 23px;}
.btn-solid {background:var(--sage); border:1px solid var(--sage); box-shadow:inset 0 0 0 3px var(--beige-bg),inset 0 0 0 4px var(--sage);}
.btn-solid:hover {background:var(--ink-black); transform:translateY(-2px); box-shadow:inset 0 0 0 3px var(--beige-bg);}
.btn-outline {border-color:var(--ink-faint);}
.hero {position:relative; min-height:0; max-width:1440px; margin:auto; padding:78px 74px 64px; gap:36px; align-items:center;}
.hero-content {max-width:690px; flex:1.25;}
.hero-eyebrow {border:0; background:none; padding:0; border-radius:0; color:var(--sage); font-size:10px; letter-spacing:.12em; line-height:1.8; margin-bottom:26px;}
.hero-headline {font-size:clamp(60px,6.8vw,108px); line-height:.94; letter-spacing:-.045em; font-weight:400; margin-bottom:28px;}
.hero-headline .italic-line {color:var(--plum);}
.hero-sub {font-size:21px; line-height:1.5; max-width:580px; margin-bottom:16px;}
.hero-sub-small {font-size:15px; max-width:550px; line-height:1.8; margin-bottom:28px;}
.hero-cta-group {margin-bottom:28px; gap:12px;}
.hero-proof {gap:12px; margin-bottom:32px;}
.proof-item {font-size:10px;}
.hero-stats-grid {max-width:630px; grid-template-columns:repeat(3,1fr); gap:20px 22px; border-top:3px double var(--ink-faint); padding-top:22px;}
.hero-stat-value {font-family:'EB Garamond',Georgia,serif; font-size:25px;}
.hero-stat-label {font-size:8px; letter-spacing:.08em; color:var(--ink-light);}
.royal-plate {flex:1; width:100%; max-width:440px; position:relative; text-align:center; color:var(--sage); padding:20px 0;}
.royal-plate svg {display:block; width:100%; height:auto;}
.plate-label {font-family:'Space Mono',monospace; font-size:9px; letter-spacing:.19em; text-transform:uppercase; color:var(--ochre); margin:18px 0;}
.plate-caption {font-family:'EB Garamond',Georgia,serif; font-size:26px; font-style:italic; color:var(--ink-mid);}
.royal-product {max-width:1292px; margin:0 auto 66px; padding:28px; border:1px solid var(--ink-faint); outline:1px solid var(--divider); outline-offset:7px; background:var(--beige-card);}
.royal-product-label {display:flex; justify-content:space-between; margin-bottom:22px; font:10px 'Space Mono',monospace; text-transform:uppercase; letter-spacing:.13em; color:var(--ink-mid);}
.royal-product .hero-product-col {display:block; height:auto;}
.royal-product #hero-mockup {max-width:100%!important; transform:none!important; border-radius:0!important; box-shadow:none!important; border:1px solid var(--ink-faint)!important;}
.royal-product #hero-mockup img {max-height:540px; object-fit:contain; background:var(--beige-bg);}
.section-inner {max-width:1292px; padding:84px 32px;}
.section-divider {border-top:1px solid var(--ink-faint);}
.section-eyebrow {font-size:10px; letter-spacing:.15em; color:var(--ochre); margin-bottom:35px;}
.section-h2,.use-cases-h2 {font-family:'EB Garamond',Georgia,serif; font-weight:400; font-size:clamp(44px,5vw,72px); line-height:1.02; letter-spacing:-.035em;}
.section-eyebrow:after {content:'✧'; color:var(--ochre); font-size:19px; margin-left:12px;}
.bento-grid {gap:14px;}
.feature-card {border:1px solid var(--ink-faint); border-radius:0; box-shadow:none; background:var(--beige-card);}
.feature-card:hover {box-shadow:inset 0 0 0 4px var(--beige-bg);}
.feature-card h3 {font-family:'EB Garamond',Georgia,serif; font-size:30px; font-weight:400;}
.step-card {border-top:3px double var(--ink-faint);}
.step-num {color:var(--ochre);}
.step-title {font-size:31px;}
.pricing-card {border:1px solid var(--ink-faint); border-radius:0; outline:1px solid var(--divider); outline-offset:-7px; box-shadow:none;}
.pricing-card.featured {background:var(--sage); border-color:var(--sage); outline-color:var(--beige-deep);}
.pricing-amount {font-size:66px;}
.pricing-badge {border-radius:0;}
.precision-visual {border-radius:0; border-color:var(--ink-faint); box-shadow:none;}
.faq-item {border-color:var(--ink-faint); border-radius:0;}
.cta-headline {font-size:clamp(48px,7vw,94px); line-height:1; font-weight:400;}
.cta-section:before {content:'✧ ───────── ✧ ───────── ✧'; display:block; text-align:center; color:var(--ochre); padding-top:40px; letter-spacing:.12em;}
.footer {background:var(--sage); border-top:6px double var(--beige-bg);}
.footer:before {content:'SynthAI'; display:block; font:clamp(80px,18vw,240px)/1 'EB Garamond',Georgia,serif; text-align:center; letter-spacing:-.05em; padding:0 0 50px; color:var(--beige-bg);}
.footer-links a,.footer-brand-desc {color:var(--beige-bg);}
.footer-col-title,.footer-copy,.footer-legal a {color:var(--beige-deep);}
:focus-visible {outline:2px solid var(--ochre); outline-offset:5px;}
@media(min-width:1500px){.site-header-inner{margin:auto;}}
@media(max-width:1100px){.site-header-inner{padding:20px; margin:0 20px;}.site-header-nav{gap:0}.site-header-link{padding:8px 6px;font-size:9px}.hero{padding:60px 40px;}.hero-headline{font-size:72px}.royal-product{margin:0 32px 55px}.site-header-actions .btn-pill{display:none}}
@media(max-width:767px){.site-header-inner{margin:0 16px;padding:18px 4px}.hero{padding:46px 24px 40px;gap:24px}.hero-content{width:100%}.hero-headline{font-size:clamp(53px,12vw,78px)}.hero-eyebrow{font-size:8px;letter-spacing:.07em}.hero-sub{font-size:19px}.hero-sub-small{font-size:14px}.hero-proof{gap:9px}.hero-stats-grid{gap:16px 8px}.hero-stat-label{font-size:7px}.hero-stat-value{font-size:22px}.royal-plate{max-width:310px}.royal-product{margin:0 22px 45px;padding:15px}.royal-product-label{font-size:8px;letter-spacing:.03em}.section-inner{padding:56px 24px}.btn-solid-lg,.btn-outline{padding:16px 20px;font-size:10px}.plate-caption{font-size:23px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}*,*::before,*::after{animation:none!important;transition:none!important}.fade-up{opacity:1!important;transform:none!important}}
'''

rays = ''.join(f'<path d="M{220+156*math.cos(a):.2f} {210+156*math.sin(a):.2f}L{220+192*math.cos(a):.2f} {210+192*math.sin(a):.2f}"/>' for a in [i*math.pi/60 for i in range(120)])
leaves = ''
for side in (-1,1):
    for i in range(12):
        y=330-i*16
        x=220+side*(55+65*math.sin(i/12*math.pi*.85))
        leaves+=f'<ellipse cx="{x:.1f}" cy="{y}" rx="6" ry="17" transform="rotate({side*(35+i*3)} {x:.1f} {y})"/>'
engraving = f'''<aside class="royal-plate" aria-label="Decorative engraved book and laurel emblem">
<p class="plate-label">The art of evidence · SynthAI</p>
<svg viewBox="0 0 440 430" fill="none" stroke="currentColor" stroke-width=".8" aria-hidden="true">
<g opacity=".55">{rays}</g><circle cx="220" cy="210" r="150"/><circle cx="220" cy="210" r="145" stroke-dasharray="1 5"/>
<path d="M220 370C90 330 72 204 139 116M220 370C350 330 368 204 301 116" stroke-width="1.5"/>
<g fill="var(--beige-card)" stroke-width="1.1">{leaves}</g>
<path d="M220 280Q163 248 122 265V158Q171 145 220 177Q269 145 318 158V265Q277 248 220 280Z" fill="var(--beige-bg)" stroke-width="2"/>
<path d="M220 177V280M129 155V257Q177 247 220 274Q263 247 311 257V155M118 168L111 172V275Q165 257 220 289Q275 257 329 275V172L322 168"/>
<g opacity=".7">{''.join(f'<path d="M140 {183+i*8}Q175 {174+i*8} 207 {191+i*8}M233 {191+i*8}Q268 {174+i*8} 300 {183+i*8}"/>' for i in range(8))}</g>
<path d="M220 98L225 112L240 117L225 122L220 136L215 122L200 117L215 112Z" fill="var(--ochre)" stroke="var(--ochre)"/>
<path d="M196 332Q220 321 244 332M202 340Q220 333 238 340M196 367L244 380M244 367L196 380"/>
<text x="220" y="315" fill="currentColor" stroke="none" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="18">S</text>
</svg><p class="plate-caption">From knowledge, clarity.</p><p class="plate-label">Extract · Verify · Publish</p></aside>'''

html = html.replace('</head>', f'<style id="royal-edition">{css}</style>\n</head>')
start=html.index('      <!-- Right — Dashboard screenshot -->')
end=html.index('    </section>',start)
product=html[start:end]
html=html[:start]+engraving+'\n'+html[end:]
hero_end=html.index('    </section>',start)+len('    </section>')
html=html[:hero_end]+f'\n<section class="royal-product" aria-label="Platform preview"><div class="royal-product-label"><span>Plate I — The research workspace</span><span>SynthAI / Product preview</span></div>{product}</section>'+html[hero_end:]
Path(__file__).with_name('version_3_royal.html').write_text(html,encoding='utf-8')
print('Created royal edition; original preserved. Bytes:',len(html.encode()))
