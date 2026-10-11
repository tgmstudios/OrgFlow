#!/usr/bin/env python3
"""Create consistent, nonidentifying operational records for the fictional pantry."""
from pathlib import Path
from datetime import date,datetime,timedelta
from email.message import EmailMessage
import csv,json,random,re
ROOT=Path(__file__).resolve().parent.parent
DRIVE=ROOT/"01_Google_Drive"
MAIL=ROOT/"02_Gmail_Examples"
CAL=ROOT/"03_Event_Calendar"
rng=random.Random(1042)
def save_csv(relative, rows, fields):
    path=DRIVE/relative;path.parent.mkdir(parents=True,exist_ok=True)
    with open(path,"w",encoding="utf-8",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
    print("CSV",path.relative_to(ROOT),len(rows))
    return path

names=["Avery","Morgan","Taylor","Drew","Reese","Quinn","Blair","Casey","Elliot","Devon",
       "Harper","Cameron","Riley","Parker","Skyler","Jamie","Alex","Logan","Rowan","Emery",
       "Finley","Charlie","Sage","Hayden"]
stations=["Welcome table","Produce","Dry goods","Packing","Carrying help","Chilled storage"]
volunteers=[]
for i,name in enumerate(names,1):
    volunteers.append(dict(volunteer_id=f"VOL-{i:03}",first_name=name,last_initial=chr(65+(i*3)%26),
         available_day=["Wednesday","Friday","Tuesday packing","Wednesday and Friday"][i%4],
         preferred_station=stations[i%len(stations)],shift_lead_trained="yes" if i in (3,7,12,19) else "no",
         orientation_complete="no" if i in (21,22,23,24) else "yes",
         latest_shift=["2026-10-02","2026-10-07","2026-10-09","2026-10-14"][i%4],
         status="waitlist" if i in (20,23) else "active"))
save_csv("Operations/Volunteer_Availability_October.csv",volunteers,list(volunteers[0]))
donations=[]
amounts=[25,50,35,75,125,40,60,150,1200,250,45,80,100,30,1500,55,90,200,15,250,40,120,70,75]
for i,amount in enumerate(amounts,1):
    received=date(2026,10,1)+timedelta(days=(i-1)%10)
    receipt_due=received+timedelta(days=1)
    working=received
    count=0
    while count<2:
        working+=timedelta(days=1)
        if working.weekday()<5:count+=1
    donations.append(dict(gift_id=f"GIFT-{i:04}",donor_alias=f"Donor D-{i:03}",
          received_date=received.isoformat(),amount_usd=f"{amount:.2f}",
          campaign=["General pantry","Winter shelves","Harvest Dinner"][i%3],
          designation=["Unrestricted","Food procurement","Event support"][i%3],
          receipt_due=receipt_due.isoformat(),
          receipt_sent="" if i in (8,15) else receipt_due.isoformat(),
          personal_thanks_due=working.isoformat(),
          personal_thanks_sent="" if i in (8,14,15) else working.isoformat(),
          director_call_required="yes" if amount>1000 else "no",
          director_call_done="no" if i==15 else ("yes" if amount>1000 else "not applicable"),
          communications_allowed="yes" if i not in (14,22) else "no"))
save_csv("Development/Donation_Register_Example.csv",donations,list(donations[0]))
months={
"2026-07":[90,108,103,100],
"2026-08":[102,110,100,107],
"2026-09":[104,115,111,110],
}
outcomes=[]
for m,values in months.items():
    for i,n in enumerate(values,1):
        outcomes.append(dict(period=m,week_in_month=i,household_visits=n,
            counted_by="Sam Rivera",review_status="approved internal example",
            definition="one household distribution visit, not a unique household"))
save_csv("Programs/Outcomes_Jul_Sep.csv",outcomes,list(outcomes[0]))
budget_categories=[
("Groceries",19500,18840),("Cold storage and food safety",4200,3790),
("Volunteer support and training",2500,2190),("Facility and utilities",6800,7080),
("Transportation",1900,1730),("Program materials",2400,2210),
("Administrative allocation",3100,3040)]
budget=[]
for cat,planned,actual in budget_categories:
    budget.append(dict(category=cat,quarter_budget_usd=planned,quarter_actual_usd=actual,
      variance_usd=planned-actual,reviewed_by="Sam Rivera",status="synthetic example"))
save_csv("Development/Q3_Budget_to_Actual.csv",budget,list(budget[0]))
tasks=[
("Finalize room layout","2026-10-12","Sam Rivera","done"),
("Check volunteer coverage","2026-10-15","Jordan Lee","done"),
("Confirm dietary requirements","2026-10-19","Sam Rivera","in progress"),
("Approve event script","2026-10-21","Maya Chen","open"),
("Prepare check-in materials","2026-10-23","Jordan Lee","open"),
("Staff safety briefing","2026-10-24","Sam Rivera","open"),
("Guest doors open","2026-10-24","Jordan Lee","open"),
("Program welcome","2026-10-24","Maya Chen","open"),
("Close and reconcile contributions","2026-10-24","Priya Patel","open"),
("Send sponsor thank-yous","2026-10-26","Priya Patel","open"),
("Reconcile event totals","2026-10-27","Maya Chen","open"),
("Share approved event recap","2026-10-30","Priya Patel","open")]
event_rows=[dict(task_id=f"EVENT-{i:03}",task=name,due_date=day,owner=person,status=status) for i,(name,day,person,status) in enumerate(tasks,1)]
save_csv("Programs/Harvest_Dinner_Task_Tracker.csv",event_rows,list(event_rows[0]))
review_rows=[]
for i,(process,owner,review,status) in enumerate([
("Volunteer Welcome and First Shift","Jordan Lee","2027-01-06","published"),
("Monthly Volunteer Scheduling","Jordan Lee","2027-01-04","published"),
("Donor Thank You and Receipts","Maya Chen","2026-12-01","published"),
("Quarterly Grant Reporting","Maya Chen","2026-12-07","published"),
("Harvest Dinner Event Runbook","Maya Chen","2026-10-25","draft"),
("Building Safety and Cold Chain","Sam Rivera","2026-12-28","published"),
("Board Meeting Preparation","Sam Rivera","2027-01-02","published"),
("Maya Chen Transfer Guide","Priya Patel","2026-11-15","draft"),
("Quarterly Impact Snapshot","Sam Rivera","2026-11-01","draft"),
],1):
    review_rows.append(dict(id=f"SOP-{i:03}",title=process,owner=owner,
     review_due=review,status=status,approval_required="yes",synthetic="yes"))
save_csv("Governance/Procedure_Review_Tracker.csv",review_rows,list(review_rows[0]))

def send_email(filename,sender,recipient,subject,date_str,body):
    msg=EmailMessage()
    msg["From"]=sender+" <"+sender.lower().replace(" ",".")+"@example.org>"
    msg["To"]=recipient+" <"+recipient.lower().replace(" ",".")+"@example.org>"
    msg["Date"]=date_str
    msg["Subject"]=subject
    msg["X-OrgFlow-Demo"]="Fictional example - do not send"
    msg.set_content(body.strip()+"\n")
    (MAIL/filename).write_bytes(msg.as_bytes())
    (MAIL/filename.replace(".eml",".txt")).write_text(
       f"Subject: {subject}\nFrom: {sender}\nTo: {recipient}\nDate: {date_str}\n\n"+body.strip()+"\n",encoding="utf-8")
mails=[
("01_Welcome_to_Your_First_Shift.eml","Jordan Lee","Alex Morgan","Your first pantry shift | Friday, October 16","Tue, 13 Oct 2026 09:10:00 -0400",
"""Hi Alex,

We are looking forward to meeting you on Friday. Please arrive by 8:30 a.m. at the blue welcome table beside the side entrance. A shift lead will show you around, introduce your buddy, and help you settle in before distribution opens at 9:00.

Please wear closed-toe shoes. You do not need to bring anything else. If your schedule changes, reply here and we'll adjust.

Thanks for giving your time,
Jordan"""),
("02_October_Schedule_Reminder.eml","Jordan Lee","Sam Rivera","Volunteer schedule is ready for final review","Thu, 22 Oct 2026 10:20:00 -0400",
"""Hi Sam,

The November volunteer schedule is ready for review. I collected availability by the 15th and finalized the placements today, the 22nd. Two first-time volunteers are paired with returning buddies.

Please confirm the chilled-storage station has trained coverage. I will send confirmations once you approve the assignment sheet. Reminders will go two days before each shift.

Jordan"""),
("03_Donor_Acknowledgement_Queue.eml","Maya Chen","Priya Patel","Friday donor acknowledgements | two items to review","Fri, 09 Oct 2026 13:05:00 -0400",
"""Hi Priya,

The fictional sample donor register shows two acknowledgements needing follow-up. Please confirm the automated receipt for GIFT-0008 and review the personal note before marking it complete.

GIFT-0015 is over $1,000, so it needs a director call as well as the usual receipt and personal thank-you. The contact preference is recorded as allowed. Do not include the amount on voicemail.

We'll rehearse this queue together on October 29.
Maya"""),
("04_Quarterly_Grant_Due.eml","Maya Chen","Sam Rivera","Community Table Fund example report: October milestones","Fri, 16 Oct 2026 08:00:00 -0400",
"""Hi Sam,

This is the kickoff for our fictional quarterly report due November 6. We need the July through September outcomes definition and reconciled totals by October 20, and the budget table from Finance by October 23.

Executive Director review is due October 30, one week before submission. Please flag anything still awaiting verification instead of filling gaps with estimates.

Thanks,
Maya"""),
("05_Harvest_Dinner_Staff_Brief.eml","Jordan Lee","Sam Rivera","Harvest Dinner: check-in and privacy briefing","Wed, 21 Oct 2026 15:40:00 -0400",
"""Sam,

For Saturday's example dinner, setup begins at 3:30 p.m. and the staff safety briefing is at 5:00. Guest doors open at 5:30, and the program starts at 6:15.

Please keep the accessible entrance clear and remind everyone that guests are not automatically consenting to photography. Priya will help reconcile event contributions separately from the open check-in list.

Jordan"""),
("06_Maya_Handoff_Request.eml","Sam Rivera","Maya Chen","Role handoff: what isn't documented yet?","Mon, 26 Oct 2026 10:00:00 -0400",
"""Hi Maya,

Before your November 15 departure, we need a practical handoff for Priya. We have the donor and grant procedures, but you know the funder portal's manual formatting steps, the donor call backup arrangements, and where the most recent sponsor information lives.

Could we record a consented role interview on November 9? We'll turn the reviewed transcript into a draft, ask you to correct it, and publish only after you and Priya approve.

Sam"""),
("07_Priya_Transfer_Confirmation.eml","Priya Patel","Sam Rivera","November 12 handoff rehearsal","Thu, 29 Oct 2026 12:15:00 -0400",
"""Hi Sam,

I can run the donor exception check with Maya on October 29 and then do the full process independently on November 12. I will confirm access using our password manager, not copied credentials in a document.

Please leave the open questions visible until we have real answers. I'd rather see one missing item than inherit an invented instruction.

Priya"""),
("08_Superseded_Arrival_Time.eml","Jordan Lee","Alex Morgan","Old draft: volunteer arrival at 9:00","Wed, 30 Sep 2026 09:00:00 -0400",
"""Alex,

This is an outdated draft that was never sent. It says first-time volunteers arrive at 9:00.

SUPERSEDED: The approved Volunteer Welcome and First Shift procedure dated October 6 states new volunteers arrive at 8:30 a.m. Use the approved procedure, not this old example.

Jordan"""),
]
for name,fromn,ton,subject,date_str,body in mails:
    send_email(name,fromn,ton,subject,date_str,body)
print("EMAILS",len(mails), "plus text-indexable companion copies")

events=[
("Staff safety and room check","20261024T153000","20261024T160000","Sam Rivera","Harvest Dinner example"),
("Volunteer briefing","20261024T170000","20261024T171500","Jordan Lee","Harvest Dinner example"),
("Harvest Dinner doors open","20261024T173000","20261024T200000","Maya Chen","Fictional event, no real tickets"),
("Volunteer availability deadline","20261015T170000","20261015T173000","Jordan Lee","Each month, collect by the 15th"),
("Monthly shift schedule review","20261022T140000","20261022T143000","Jordan Lee","Each month, finalize by the 22nd"),
("Quarterly grant report starts","20261016T090000","20261016T093000","Maya Chen","Three weeks before report deadline"),
("Executive grant review","20261030T110000","20261030T120000","Maya Chen","One week before report due"),
("Quarterly grant report due","20261106T160000","20261106T163000","Priya Patel","Community Table Fund fictional report"),
("Maya and Priya role interview","20261109T100000","20261109T110000","Sam Rivera","Consent required before voice recording"),
("Independent handoff rehearsal","20261112T110000","20261112T120000","Priya Patel","No credentials shared in notes"),
("Maya final transition","20261115T160000","20261115T163000","Sam Rivera","Check owners and successor checklist")
]
lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//OrgFlow//Fictional Demo//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:Centre Valley Pantry Example"]
for i,(title,start,end,owner,desc) in enumerate(events,1):
    lines+=["BEGIN:VEVENT",f"UID:orgflow-example-{i:03}@example.org","DTSTAMP:20261011T210000Z",
            f"DTSTART;TZID=America/New_York:{start}",f"DTEND;TZID=America/New_York:{end}",
            f"SUMMARY:{title}",f"DESCRIPTION:Fictional demonstration. Owner: {owner}. {desc}","STATUS:CONFIRMED","END:VEVENT"]
lines.append("END:VCALENDAR")
(CAL/"OrgFlow_Example_Calendar.ics").write_text("\r\n".join(lines)+"\r\n",encoding="utf-8")
print("CALENDAR",len(events),"events")
