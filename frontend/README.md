# OrgFlow frontend

React with Bun HTML imports (no Vite), Tiptap rich text, and Lucide icons.

```sh
bun install
bun --hot index.ts
```

Runs locally at `http://127.0.0.1:3002`. Start the backend at port 3003; `/api`, `/auth`, `/docs`, `/swagger`, and `/openapi.json` proxy there. Set `BACKEND_URL` or `PORT` to override. Default bind is loopback.

```sh
bun check
bun build index.html --outdir /tmp/orgflow-frontend-build
```

Home presents chat, recent files and agenda/month calendar. Files preserve provider folder paths initially and allow rearranging link paths in OrgFlow only. Knowledge Base supports categories, manual authoring, Tiptap rich text/images/checklists, draft autosave and explicit publication. The assistant offers shared chat/voice conversation, centering/docking, explicit Google source reads and text-file capture with AI consent.

Browser voice requires supported SpeechRecognition and microphone permission; availability/errors are shown. This uses browser speech services, not a dedicated realtime voice backend. Chat remains available. Images support public URLs or uploads (5 MB limit on backend). Google must be configured and explicitly connected; SharePoint and OneDrive are future integrations. Sample workspace content is demo data.
