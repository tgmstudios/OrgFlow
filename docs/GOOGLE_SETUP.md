# OrgFlow Google setup

Project: `orgflow-20261011`. Gmail API and Google Drive API are enabled and verified.

## Finish in Google Auth Platform

1. Open [Branding](https://console.cloud.google.com/auth/branding?project=orgflow-20261011) and click **Get started** if shown. App name: **OrgFlow**. Use your personal Google login for support and contact emails. Choose **External**, review Google's data policy, and finish creation.
2. Open [Audience](https://console.cloud.google.com/auth/audience?project=orgflow-20261011). Keep the app in **Testing** and add your Google login under **Test users**.
3. Open [Data Access](https://console.cloud.google.com/auth/scopes?project=orgflow-20261011). For read-only email capture and Drive folder browsing/content capture, add `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/drive.readonly`. These are proposed connector scopes; no personal data has been accessed. Basic login can additionally request `openid`, `email`, and `profile`.
4. Open [Clients](https://console.cloud.google.com/auth/clients?project=orgflow-20261011), click **Create client**, choose **Web application**, and name it **OrgFlow Local Development**. Add authorized redirect URI `http://localhost:3003/auth/google/callback`. This is the implemented backend callback. No JavaScript origin is needed for the planned server-side OAuth flow.
5. Save the client ID and secret to the existing Git-ignored `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Also set `GOOGLE_CLOUD_PROJECT=orgflow-20261011` and `GOOGLE_REDIRECT_URI=http://localhost:3003/auth/google/callback`. Preserve existing Luminal values. Keep the file owner-readable only (`chmod 600 backend/.env`). Do not commit credentials or paste them in chat.

The local backend now implements read-only OAuth, Drive metadata sync, and selected Google Docs/text/Gmail plain-text readers. Browser consent must still complete before live access can be verified. This connection is not staff authentication. Add the exact HTTPS backend callback to this client when a deployed URL is selected.

Official instructions: [consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent), [web client credentials](https://developers.google.com/workspace/guides/create-credentials).
