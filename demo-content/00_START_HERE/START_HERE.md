# OrgFlow showcase package

Centre Valley Community Pantry is a carefully constructed fictional nonprofit. The named team, event calendar, donor register, outcomes, emails, procedures and role transitions are original demo content. They do not refer to actual customers or real private data.

This package follows the newest OrgFlow web and iOS implementation at the time of creation, including Google Drive and Gmail indexing, sourced Ask responses, Discover, knowledge procedures, human review and publication, checklists, People, Transfer, Knowledge Health, ElevenLabs web voice, and iOS Capture and Library.

## The one story viewers follow

Maria Reyes has been the pantry's volunteer coordinator for six years. The 19.93 second opening video introduces Maria as leaving. Jordan Lee must take over without asking Maria how everything works. Her documents and short recorded exit interview contain arrival times, scheduling rules, and handoff details. OrgFlow helps the team find the information, verify citations, turn it into a procedure, review it, and give Jordan an actionable checklist.

A second related example shows Maya Chen, Development Director, preparing to hand donor acknowledgements and quarterly grant reporting to Priya Patel. This adds believable organizational scope to Discover, People, and Knowledge Health.

## Start with Sam

Open 06_Sam_Video_Package/PASTE_THIS_TO_SAM_SECOND_HALF.md. It is a continuation prompt for an editor, generated after inspecting the actual opening, not a generic storyboard.

## Import the corpus

Open 07_Import_And_QA/Google_Drive_And_Gmail_Import_Guide.md.

The folder 01_Google_Drive preserves plausible departmental hierarchy. Source documents have .md, .txt and .pdf versions. Four documents also have editable Word counterparts. The text versions support the backend's searchable source types, while PDF counterparts provide genuine files to display and open from Google Drive.

The 02_Gmail_Examples directory contains nine complete RFC 822 example messages and text companions. Do not send them to real addresses; use a dedicated test mailbox if simulating Gmail sync.

03_Event_Calendar contains an importable iCalendar for production design. It does not imply OrgFlow has implemented external calendar sync.

04_Voice_And_iOS contains original fictional interview transcripts and spoken demonstration prompts.

05_Mindmap_Sneak_Peek contains an illustrative fallback graphic. The live interactive Knowledge map and Clusters view have now been merged into main. Test and film the actual Clusters screen first. If unavailable, use the fallback only as an explicitly labelled concept.

06_Sam_Video_Package contains the second-half editorial prompt, reference storyboard images and an edit checklist.

07_Import_And_QA contains fifteen questions with exact supporting source passages and an import guide.

## Keep these distinctions accurate

The shipped backend can index Google Docs, text, Markdown and CSV with consent. Current PDF and DOCX files can be listed or opened as Drive files but are not text-extracted by this backend. Google Calendar sync and Microsoft 365 are not yet implemented. The standalone SVG knowledge graph is a fallback concept. An interactive owner-based Clusters view is now implemented in main, though deployment remains to be verified. Some new code may not have been deployed by the time of filming. iOS has not been verified on a physical device.

Content labels inside the fictional sources state that this is a demonstration. The advertised feature is the product workflow, not a claim that these events or figures occurred.

## Quick reproducibility

The scripts directory contains the original data generators:
build_records.py for CSVs, nine email fixtures, and the calendar;
build_documents.py for PDFs, Word and plaintext formats;
build_extras.py for Maria's email and the graph concept;
validate_and_manifest.py for data integrity, source quotes, PDF text verification and file manifest.

Use 00_START_HERE/ALL_FILES.txt and FILE_MANIFEST.json for the complete list of files. Sam can find specific assets by searching that manifest.

## GitHub safety

This pack lives on feat/orgflow-demo-showcase in a separate worktree. It does not change the backend, frontend, iOS project or deployment code. Do not merge or deploy the branch without team approval.
