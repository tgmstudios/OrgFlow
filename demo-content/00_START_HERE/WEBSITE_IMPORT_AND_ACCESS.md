# OrgFlow website import and access setup

This guide is for the fictional Centre Valley Community Pantry. Use it with the official OrgFlow website and never confuse fictional staff with actual authenticated users.

## Actual organization account

The data installation is restricted to an organization whose exact name is:

Centre Valley Community Pantry (OrgFlow Showcase)

Create that organization in the sign-up flow with an email account controlled by the team, or sign in to the account created for the showcase if one has already been provided.

The sign-up creator is an OrgFlow admin. The organization has a private UUID. The shared default demo workspace is explicitly prohibited from using this import. An unrelated organization's admin is also prohibited.

To add the real hackathon teammates, give them the organization invite code in Organization settings. Each teammate should sign up or join under their own authenticated identity, becoming a member. Do not register Maria, Maya, Jordan, Priya or Sam Rivera as real accounts. These names represent fictional staff records for the demonstration.

An OrgFlow admin account is an authentication and invitation role. An entry under People is a workflow or organizational ownership record. Being a supervisor in People does NOT automatically grant admin privileges or access to another person's Gmail or Drive.

## One click import

Once the feature branch is reviewed and deployed, open OrgFlow, sign into the isolated showcase organization, choose Organization, then use the Showcase library panel. Review its confirmation and click Load showcase files and staff.

The server imports the prebuilt fictional corpus from the deployed version of demo-content. It does not call Luminal, ElevenLabs, Gmail or Google Drive while importing. It creates only synthetic records in this one organization, with fixed IDs, so it can be rerun without duplication. The installer never overwrites manually corrected demo role records, source ownership, file-folder positions or draft edits.

## People, roles, supervisors and successors

Sam Rivera: Operations Manager, active, no supervisor recorded. Supervisor of Maria Reyes and Jordan Lee.

Maria Reyes: Volunteer Coordinator, leaving October 31 after six years, reports to Sam Rivera, successor Jordan Lee.

Jordan Lee: Incoming Volunteer Coordinator, active, reports to Sam Rivera.

Maya Chen: Development Director, leaving November 15, no supervisor recorded, successor Priya Patel.

Priya Patel: Development Associate, active, reports to Maya Chen.

These relationships are organizational metadata for People and the Knowledge map. The backend validates supervisors against other People records within the same organization and forbids reporting cycles.

## Source and folder ownership

Operations / Volunteer Welcome and First Shift: Maria Reyes.
Operations / Monthly Volunteer Scheduling: Maria Reyes.
Operations / Volunteer Availability October: Maria Reyes.
Operations / Building Safety and Cold Chain: Sam Rivera.

Development / Donor Thank You and Receipts: Maya Chen.
Development / Quarterly Grant Reporting: Maya Chen.
Development / Donation Register Example: Maya Chen.
Development / Q3 Budget to Actual: Maya Chen.

Programs / Harvest Dinner Event Runbook and event materials: Maya Chen.
Programs / Quarterly Impact Snapshot and Outcomes: Sam Rivera.
Governance / Board Meeting Preparation and Procedure Review Tracker: Sam Rivera.

People and Transfer / Maria Reyes Handoff: Maria Reyes.
People and Transfer / Maya Chen Transfer Guide: Maya Chen.
People and Transfer / Staff Ownership and Contacts: Sam Rivera.

Nine synthetic email records are assigned to the fictional sender where the name matches an existing People entry. A few records sent by fictional Jordan Lee or Sam Rivera have their appropriate source owners recorded.

## Actual file access

The website's Files view receives document metadata and real working URLs for PDFs, DOCX, Markdown, CSV and PNG files. The originals are stored in the public team GitHub showcase branch and identified honestly as OrgFlow Showcase files, not as connected Google Drive documents. The folder tree reflects Operations, Development, Programs, Governance, and People And Transfer.

The question-answer index contains text from eleven original Markdown source documents, six CSV datasets, and nine synthetic message text copies. OrgFlow can use the text for citation and procedure drafts. PDFs and DOCX are linked for opening and viewing, not directly parsed as AI source text by this importer.

The Google Drive and Gmail account connection is a SEPARATE user-authorized action. The Google connection in ChatGPT does not authorize the OrgFlow website to use it. To prove real provider integration, connect the intended account through OrgFlow Files, sync metadata, explicitly consent to indexing, and verify that the provider lists newly indexed Google Docs or Gmail messages. Do not upload this example corpus into a personal account without confirming that account is the intended destination.

## Review, source validation and publication

Every imported playbook begins as a draft. Review the text, set the correct owner, verify the source evidence and publish explicitly in the app. Handoff guide generation also requires staff review. A synthetic event should be clearly indicated as such.

An answer to "When should a new volunteer arrive?" is supported by Volunteer Welcome and First Shift. The answer should cite the 8:30 a.m. sentence. The matching PDF should open from Files. In People, Maria must report to Sam and show Jordan as successor. Knowledge map Clusters should group volunteer sources under Maria until the owner is deliberately reassigned. Changing ownership of a published playbook currently resets it to draft for another human approval.

## Verification status

The importer was tested through authenticated backend API calls in memory, including member denial, admin success, reruns, organization isolation, 13 PDF links, 26 indexed text sources, supervisor relationships and source reassignment. The front-end and backend typechecks and baseline tests also pass.

This is NOT a claim that the importer has already been deployed to production or that Google's OAuth authorization has been completed. The GitHub feature branch needs the team to review and merge it to main, which automatically triggers deployment. Then an admin must create or access the dedicated organization and perform the one-time import.

## Production safety

Deployment has an explicit human-approval requirement in AGENTS.md. No changes to existing production organization content, sign-in credentials, or Google Drive accounts are part of this branch. The separate live site's recovery from a 502 backend error was verified independently during this work.
