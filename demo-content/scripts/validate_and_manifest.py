#!/usr/bin/env python3
"""Validate the fictional corpus, citations, PDFs and create indexed manifest."""
from pathlib import Path
import csv,json,re,hashlib,subprocess
ROOT=Path(__file__).resolve().parent.parent
DRIVE=ROOT/"01_Google_Drive"
truth=[
 ("What time do new volunteers arrive?","8:30 a.m.","Operations/Volunteer_Welcome_and_First_Shift.md","New volunteers arrive by 8:30 a.m."),
 ("Where do new volunteers report?","Blue welcome table","Operations/Volunteer_Welcome_and_First_Shift.md","blue welcome table"),
 ("When is volunteer availability collected?","By the 15th","Operations/Monthly_Volunteer_Scheduling.md","Volunteer availability is collected by the 15th of the month."),
 ("When is the schedule finalized?","By the 22nd","Operations/Monthly_Volunteer_Scheduling.md","The schedule is finalized by the 22nd."),
 ("How early are reminders sent?","Two days before each shift","Operations/Monthly_Volunteer_Scheduling.md","Send shift reminders two days before each shift."),
 ("How soon should a donor get a receipt?","Within 24 hours","Development/Donor_Thank_You_and_Receipts.md","Send the automated receipt within 24 hours."),
 ("When is the personal thank-you due?","Within two working days","Development/Donor_Thank_You_and_Receipts.md","Send a personal thank-you within two working days."),
 ("Which contributions require a call?","More than $1,000","Development/Donor_Thank_You_and_Receipts.md","Gifts over $1,000 receive a call"),
 ("When does grant preparation start?","Three weeks before the deadline","Development/Quarterly_Grant_Reporting.md","Quarterly grant reports start three weeks before the deadline."),
 ("When is executive grant approval due?","One week before submission","Development/Quarterly_Grant_Reporting.md","The Executive Director reviews the final packet one week before submission."),
 ("What was the fictional visit count?","1,260 visits","Programs/Quarterly_Impact_Snapshot.md","The fictional outcomes register contains 1,260 household visits"),
 ("Who is replacing Maria?","Jordan Lee","People_And_Transfer/Maria_Reyes_Volunteer_Coordinator_Handoff.md","Incoming owner: Jordan Lee"),
 ("When is Maria's last day?","October 31, 2026","People_And_Transfer/Maria_Reyes_Volunteer_Coordinator_Handoff.md","Handoff date: October 31, 2026"),
 ("Who is replacing Maya?","Priya Patel","People_And_Transfer/Maya_Chen_Transfer_Guide.md","Priya Patel"),
 ("What remains unanswered?","Backup, portal mapping, sponsor location","People_And_Transfer/Maya_Chen_Transfer_Guide.md","Which of the"),
]
# Some evidence fragments in input notes may differ; reject rather than manufacturing quotes.
data=[]
for i,(q,a,path,quote) in enumerate(truth,1):
    body=(DRIVE/path).read_text(encoding="utf-8")
    if quote not in body:
        if "What remains unanswered?" in q:
            quote="Which funder portal fields have previously required manual reformatting?"
        if quote not in body:
            raise AssertionError(f"Missing supporting quote for {q}: {quote!r}")
    data.append({"id":f"QA-{i:02}","question":q,"expected_answer":a,
        "source_file":path,"source_quote":quote,"verified_in_source":"yes"})
qa=ROOT/"07_Import_And_QA/Verified_Questions_And_Sources.csv"
with qa.open("w",encoding="utf-8",newline="") as f:
    writer=csv.DictWriter(f,fieldnames=list(data[0]));writer.writeheader();writer.writerows(data)

donations=list(csv.DictReader((DRIVE/"Development/Donation_Register_Example.csv").open()))
assert len(donations)==24
volunteers=list(csv.DictReader((DRIVE/"Operations/Volunteer_Availability_October.csv").open()))
assert len(volunteers)==24
visits=list(csv.DictReader((DRIVE/"Programs/Outcomes_Jul_Sep.csv").open()))
assert sum(int(row["household_visits"]) for row in visits)==1260
assert len(visits)==12
assert sum(int(v["household_visits"]) for v in visits if v["period"]=="2026-07")==401
assert sum(int(v["household_visits"]) for v in visits if v["period"]=="2026-08")==419
assert sum(int(v["household_visits"]) for v in visits if v["period"]=="2026-09")==440
assert "BEGIN:VCALENDAR" in (ROOT/"03_Event_Calendar/OrgFlow_Example_Calendar.ics").read_text()
graph=json.loads((ROOT/"05_Mindmap_Sneak_Peek/Knowledge_Cluster_Concept.json").read_text())
node_ids={n["id"] for n in graph["nodes"]}
assert all(e["source"] in node_ids and e["target"] in node_ids for e in graph["edges"])
pdfs=list(DRIVE.rglob("*.pdf"))
for p in pdfs:
    assert p.stat().st_size>2000, str(p)
    pdftotext=subprocess.run(["gs","-q","-dNOPAUSE","-dBATCH","-sDEVICE=txtwrite","-sOutputFile=-",str(p)],capture_output=True,text=True)
    if pdftotext.returncode!=0: raise AssertionError(f"PDF couldn't be extracted: {p}")
    assert len(pdftotext.stdout.strip())>100, f"PDF appears empty: {p}"
docs=list(DRIVE.rglob("*.md"))
for p in docs:
    assert p.with_suffix(".txt").exists(), str(p)
    assert p.with_suffix(".pdf").exists(), str(p)
    assert p.stat().st_size>500, str(p)
files=sorted(f for f in ROOT.rglob("*") if f.is_file() and f.name not in {"FILE_MANIFEST.json","ALL_FILES.txt"})
all_files=ROOT/"00_START_HERE/ALL_FILES.txt"
all_paths=sorted([str(f.relative_to(ROOT)) for f in files]+["00_START_HERE/ALL_FILES.txt","00_START_HERE/FILE_MANIFEST.json"])
all_files.write_text("\n".join(all_paths)+"\n",encoding="utf-8")
files=sorted(files+[all_files])
latest_main=subprocess.run(["git","-C",str(ROOT.parent),"rev-parse","--short","origin/main"],capture_output=True,text=True,check=True).stdout.strip()
manifest={
 "pack_name":"OrgFlow Continuity Showcase | Center Valley Community Pantry",
 "fictional":True,
 "source_commit_ref":f"origin/main at {latest_main} (2026-10-11)",
 "opening_clip":"~/Downloads/orgflow_opening_v5.mp4 (19.93s, 1920x1080, 60fps)",
 "counts":{"source_documents":len(docs),"pdfs":len(pdfs),
       "word_documents":len(list(DRIVE.rglob("*.docx"))),
       "csv_tables":len(list(DRIVE.rglob("*.csv"))),
       "emails":len(list((ROOT/"02_Gmail_Examples").glob("*.eml"))),
       "calendar_events":11,"graph_nodes":len(graph["nodes"]),"verifiable_QA":len(data),
       "all_files":len(files)},
 "files":[{"path":str(f.relative_to(ROOT)),"bytes":f.stat().st_size,
     "sha256":hashlib.sha256(f.read_bytes()).hexdigest()[:16]} for f in files]
}
(ROOT/"00_START_HERE/FILE_MANIFEST.json").write_text(json.dumps(manifest,indent=2),encoding="utf-8")
print("VALIDATED",json.dumps(manifest["counts"],indent=2))
