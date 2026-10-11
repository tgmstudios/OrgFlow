#!/usr/bin/env python3
"""Additional relational, event, and graph assets for the video production."""
from pathlib import Path
import json, csv, math, hashlib
from email.message import EmailMessage
from datetime import date, timedelta
ROOT=Path(__file__).resolve().parent.parent
drive=ROOT/"01_Google_Drive"
mail=ROOT/"02_Gmail_Examples"
assets=ROOT/"05_Mindmap_Sneak_Peek"
mail.mkdir(exist_ok=True)
message=EmailMessage()
message["From"]="Maria Reyes <maria.reyes@example.org>"
message["To"]="Jordan Lee <jordan.lee@example.org>"
message["Date"]="Thu, 29 Oct 2026 13:10:00 -0400"
message["Subject"]="Your first month taking over volunteer scheduling"
message["X-OrgFlow-Demo"]="Fictional example, not a sent message"
message.set_content("""Hi Jordan,

Thanks for taking over the coordinator role after October 31. Please use the current Volunteer Welcome guide rather than my outdated September arrival note. New volunteers should be at the blue welcome table by 8:30 a.m. An experienced buddy should walk them through the first station.

For scheduling, collect availability by the 15th, finalize the roster by the 22nd, and send reminders two days before each shift.

I've put my incomplete handoff notes in People And Transfer. Please keep the open questions visible. I still need Sam to confirm the backup approval process when a shift is short staffed.

I'm glad this is becoming a process you can inherit rather than a series of things you have to remember.

Maria
""")
(mail/"09_Maria_to_Jordan_Handoff.eml").write_bytes(message.as_bytes())
(mail/"09_Maria_to_Jordan_Handoff.txt").write_text("From: Maria Reyes\nTo: Jordan Lee\nSubject: Your first month taking over volunteer scheduling\n\n"+message.get_content(),encoding="utf-8")

nodes=[
("maria","Maria Reyes","person","Outgoing coordinator",.15,.50),
("jordan","Jordan Lee","person","Incoming coordinator",.78,.45),
("welcome","Volunteer welcome","procedure","9 reviewed steps",.43,.27),
("schedule","Monthly scheduling","procedure","Availability by 15th",.41,.68),
("roster","October availability","file","24 fictional entries",.71,.78),
("interview","Maria's handoff interview","voice","Reviewed transcript",.15,.84),
("sam","Sam Rivera","person","Operations Manager",.80,.15),
("maya","Maya Chen","person","Development Director",.14,.10),
("donors","Donor acknowledgements","procedure","Receipts in 24h",.53,.06),
("grant","Quarterly grant report","procedure","Executive approval",.87,.91),
]
edges=[
("maria","welcome","knowledge contributed"),
("maria","schedule","previous owner"),
("maria","interview","voice capture"),
("interview","jordan","handoff to"),
("jordan","welcome","new owner"),
("jordan","schedule","new owner"),
("schedule","roster","based on"),
("welcome","sam","escalation to"),
("maya","donors","owns"),
("maya","grant","owns"),
("sam","grant","checks evidence"),
("roster","interview","referenced in")
]
graph={
 "schema":"orgflow-knowledge-graph-concept-v1",
 "status":"ILLUSTRATIVE DESIGN FALLBACK - live Clusters separately implemented in latest main",
 "warning":"This SVG/JSON is an illustrative fallback. The separately implemented in-app Knowledge Clusters view must be captured directly for claims about shipped functionality.",
 "organization":"Centre Valley Community Pantry (fictional)",
 "nodes":[{"id":n,"title":name,"type":typ,"subtitle":desc,"x":x,"y":y} for n,name,typ,desc,x,y in nodes],
 "edges":[{"source":a,"target":b,"relationship":relation} for a,b,relation in edges]
}
(assets/"Knowledge_Cluster_Concept.json").write_text(json.dumps(graph,indent=2),encoding="utf-8")
W,H=1920,1080
P="#7753CE"; INK="#302D3B"; PAPER="#F8F7F4"
palette={"person":("#EEE8FA","#7753CE"),"procedure":("#F7F0FF","#5C3DA5"),
         "file":("#E8F5F3","#2A7A77"),"voice":("#FEF0E9","#B75B3A")}
positions={n:(285+int(x*1350),150+int(y*740)) for n,_,_,_,x,y in nodes}
svg=['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">',
  f'<rect width="1920" height="1080" fill="{PAPER}"/>',
  '<defs><filter id="s"><feDropShadow dx="0" dy="13" stdDeviation="18" flood-color="#302D3B" flood-opacity=".09"/></filter></defs>',
  f'<text x="110" y="99" font-family="Arial,sans-serif" font-size="51" font-weight="bold" fill="{INK}">The connections behind the work.</text>',
  '<rect x="1549" y="52" rx="18" width="247" height="52" fill="#EEE8FA"/>',
  '<text x="1672" y="86" text-anchor="middle" font-family="Arial" font-size="25" fill="#7753CE" font-weight="bold">DESIGN CONCEPT</text>',
  '<text x="115" y="150" font-family="Arial,sans-serif" font-size="24" fill="#716B7D">People, sources, procedures and the knowledge between them.</text>']
for a,b,rel in edges:
  x1,y1=positions[a];x2,y2=positions[b]; dx=x2-x1
  bend=80 if abs(dx)>200 else 45
  d=f"M {x1} {y1} C {x1+dx*.42} {y1-bend}, {x1+dx*.58} {y2+bend}, {x2} {y2}"
  svg.append(f'<path d="{d}" stroke="#C6B6E6" stroke-width="4.5" fill="none" opacity=".8"/>')
for id_,name,typ,desc,x,y in nodes:
  cx,cy=positions[id_]
  bg,fg=palette[typ]
  wide=260 if len(name)<21 else 314
  height=104
  svg.append(f'<g filter="url(#s)"><rect x="{cx-wide//2}" y="{cy-50}" rx="23" width="{wide}" height="{height}" fill="#FFFFFF" stroke="#E9E3F0" stroke-width="2.5"/></g>')
  svg.append(f'<circle cx="{cx-wide//2+29}" cy="{cy-20}" r="12" fill="{fg}" opacity=".92"/>')
  svg.append(f'<text x="{cx-wide//2+50}" y="{cy-12}" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="{INK}">{name.replace("&","&amp;").replace("<","&lt;")}</text>')
  svg.append(f'<text x="{cx-wide//2+50}" y="{cy+22}" font-family="Arial,sans-serif" font-size="18" fill="#777080">{desc.replace("&","&amp;")}</text>')
svg.extend(['<rect x="0" y="1020" width="1920" height="60" fill="#302D3B"/>',
'<text x="113" y="1058" font-family="Arial,sans-serif" font-size="19" fill="#FFFFFF">ORGFLOW / ILLUSTRATIVE CLUSTERS DESIGN / FICTIONAL DEMONSTRATION</text>','</svg>'])
(assets/"Knowledge_Cluster_Sneak_Peek.svg").write_text("\n".join(svg),encoding="utf-8")
print("GRAPH",len(nodes),"nodes",len(edges),"edges")
print("MARIA_EMAIL",len(message.as_bytes()),"bytes")
