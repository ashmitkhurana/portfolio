import sys
from PIL import Image
R="/Users/ashmitkhurana/Development/Personal/portfolio/"
run=sys.argv[1]
cut=Image.open(R+"docs/ribbon/ref/ak-signature-cutout.webp").convert("RGBA")
bg=Image.new("RGBA",cut.size,(17,17,17,255)); bg.alpha_composite(cut)
m=bg.convert("RGB").resize((780,1688),Image.LANCZOS).crop((0,440,780,1688))
r=Image.open(R+"docs/ribbon/turns/real/%s/render/ribbon.png"%run).convert("RGB").crop((0,440,780,1688))
S=Image.new("RGB",(1570,1248),(40,40,40)); S.paste(m,(0,0)); S.paste(r,(790,0))
S.save(R+"docs/ribbon/turns/real/%s/latest_vs_mockup.png"%run); print("ok")
