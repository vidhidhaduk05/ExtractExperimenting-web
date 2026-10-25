from pathlib import Path
import time

path = Path(r"d:\Desktop\Rad Extract Experimenting\radextract_platform\frontend\src\pages\LandingPage.tsx")

for attempt in range(5):
    try:
        content = path.read_text(encoding="utf-8")
        target = '      {/* Hero Section */}\n      <section className="relative px-6 pt-12 pb-16 md:pt-16 md:pb-24 max-w-[1200px] mx-auto text-center flex flex-col items-center">\n        {/* Eyebrow badge */}\n        <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-[#ffdea6]/60 border border-[#7c5800]/20 text-[#7c5800] text-[11px] font-[\'Work_Sans\'] font-semibold tracking-wider uppercase">\n          <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800] animate-pulse"></span>\n          From Evidence to the Bedside\n        </div>\n\n        {/* Hero Headline */}\n        <h1 className="font-[\'Bodoni_Moda\'] text-[clamp(40px,5.8vw,72px)] font-semibold leading-[1.1] text-[#3a0f34] max-w-[920px] tracking-[-0.02em]">\n          Stay curious.<br />\n          <span className="italic text-[#66365c]">See what the evidence says.</span>\n        </h1>\n\n        {/* Hero Subhead */}\n        <p className="mt-4 max-w-[62ch] text-[18px] md:text-[20px] text-[#4f444b] font-[\'Newsreader\'] italic leading-relaxed">\n          Research begins with a patient, a careful observation, and a question worth asking.\n        </p>\n\n        {/* The .rq-card Question Box */}\n        <div className="w-full max-w-[860px] mt-8 text-left bg-white border border-[#d2c2cb] p-6 sm:p-8 shadow-sm transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]">'
        
        replacement = '      {/* Hero Section */}\n      <section className="relative px-6 pt-6 pb-10 md:pt-8 md:pb-12 max-w-[1100px] mx-auto text-center flex flex-col items-center">\n        {/* Eyebrow badge */}\n        <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-[#ffdea6]/60 border border-[#7c5800]/20 text-[#7c5800] text-[11px] font-[\'Work_Sans\'] font-semibold tracking-wider uppercase">\n          <span className="w-1.5 h-1.5 rounded-none bg-[#7c5800] animate-pulse"></span>\n          From Evidence to the Bedside\n        </div>\n\n        {/* Hero Headline */}\n        <h1 className="font-[\'Bodoni_Moda\'] text-[clamp(36px,5.2vw,64px)] font-semibold leading-[1.08] text-[#3a0f34] max-w-[920px] tracking-[-0.02em]">\n          Stay curious.<br />\n          <span className="italic text-[#66365c]">See what the evidence says.</span>\n        </h1>\n\n        {/* Hero Subhead */}\n        <p className="mt-2.5 max-w-[62ch] text-[17px] md:text-[19px] text-[#4f444b] font-[\'Newsreader\'] italic leading-relaxed">\n          Research begins with a patient, a careful observation, and a question worth asking.\n        </p>\n\n        {/* The .rq-card Question Box */}\n        <div className="w-full max-w-[860px] mt-5 text-left bg-white border border-[#d2c2cb] p-5 sm:p-6 shadow-xs transition-all focus-within:border-[#814d75] focus-within:ring-2 focus-within:ring-[#eadce6]">'

        if target in content:
            new_content = content.replace(target, replacement)
            path.write_text(new_content, encoding="utf-8")
            print("Successfully updated LandingPage.tsx hero spacing!")
            break
        else:
            # Try with normalized newlines
            content_norm = content.replace("\r\n", "\n")
            target_norm = target.replace("\r\n", "\n")
            if target_norm in content_norm:
                new_content = content_norm.replace(target_norm, replacement)
                path.write_text(new_content, encoding="utf-8")
                print("Successfully updated LandingPage.tsx with normalized newlines!")
                break
            else:
                print("Could not find exact target block.")
                break
    except PermissionError:
        time.sleep(0.5)
