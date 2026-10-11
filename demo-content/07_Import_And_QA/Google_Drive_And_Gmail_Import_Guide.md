# Importing the demonstration files

## What these files actually support

The new web app indexes consented Google Docs, plain text, Markdown and CSV files. Google Drive can list and open PDFs or Word files as provider links, but the current code does not extract their text to ground AI answers.

Each long source therefore includes matching .md, .txt and .pdf versions. The text files are the reliable AI sources. The PDFs are presentation-ready files to show in Google Drive and within provider-backed file browsing.

The emails are original .eml files plus .txt companions. To demonstrate Gmail indexing, compose these fictional messages inside a dedicated, approved Gmail test account, without sending them to real people. Dropping an .eml into Drive does not make it a Gmail message.

The calendar .ics file provides a coherent set of fictional event dates. It does not establish Google Calendar synchronization because that integration is not implemented.

## Suggested Drive hierarchy
Make a Drive folder named "OrgFlow Showcase - Center Valley Pantry" and preserve these subfolders: Operations, Development, Programs, Governance, People And Transfer.

Upload all files in the Drive bundle. Open the .txt version of key procedures and convert them into native Google Docs where possible. Keep the matching PDFs nearby for realistic opening and browsing.

Do not accidentally import sensitive files from a personal account. Google consent and indexing are distinct actions.

## Recommended filming steps

1. Open the latest live OrgFlow app and sign in with a dedicated test identity.
2. Navigate to Files, connect the approved Google test account, and grant read-only access.
3. Show the original Drive folder structure.
4. Read the source-indexing consent and explicitly allow the selected sample sources.
5. Ask: "When should a new volunteer arrive?" Show the answer and a verified source quote.
6. In Knowledge Base use Discover if the AI provider responds successfully.
7. Draft a volunteer welcome procedure, review its source, edit one line and publish deliberately.
8. Start a checklist and check off the first action.
9. In People select Maya Chen, demonstrate Transfer and its unresolved questions.
10. Show the newest iPhone Library or voice Capture if tested end-to-end.

## Important accuracy limits

Google Drive and Gmail access depend on OAuth being correctly configured, including the test user and redirect URI. The repository alone does not prove that the current live connection works. The newest People and Transfer code was recently pushed but had not been verified as deployed at the time of preparing the pack.

Image, PDF and DOCX contents should not be described as directly searchable unless the backend has actually added and tested extraction. The same is true of calendar sync.

No fictional event, result, donor or testimonial in this pack represents an OrgFlow customer.

## Latest Knowledge map and Clusters

As of the latest inspected commit bb6a6c1, the web app implements Knowledge map with Clusters and List views, owner assignment for indexed sources and playbooks, and drag-based reassignment. Ownership must be assigned by staff, not inferred from document text. For the Maria to Jordan video, add Maria as a sample person through People, assign her volunteer knowledge as owner, and verify the map before filming. If a published playbook is reassigned, the current implementation may return it to draft for approval. Use a controlled test workspace and do not perform a surprise drag during a public demo. Confirm this code has deployed before calling it a live feature.
