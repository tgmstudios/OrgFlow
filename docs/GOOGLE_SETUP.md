# OrgFlow Google setup

Project: `orgflow-20261011`. Gmail API and Google Drive API are enabled. Consent-screen and client setup are browser-only steps; their current state is not verified.

## Finish in Google Auth Platform

1. Open [Branding](https://console.cloud.google.com/auth/branding?project=orgflow-20261011) and click **Get started** if shown. App name: **OrgFlow**. Use your personal Google login for support and contact emails. Choose **External**, review Google's data policy, and finish creation.
2. Open [Audience](https://console.cloud.google.com/auth/audience?project=orgflow-20261011). Keep the app in **Testing** and add your Google login under **Test users**.
3. Open [Data Access](https://console.cloud.google.com/auth/scopes?project=orgflow-20261011). For read-only email capture and Drive folder browsing/content capture, add `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/drive.readonly`. These are the read-only scopes the backend requests. Basic login can additionally request `openid`, `email`, and `profile`.
4. Open [Clients](https://console.cloud.google.com/auth/clients?project=orgflow-20261011), click **Create client**, choose **Web application**, and name it **OrgFlow**. Add authorized redirect URIs `http://localhost:3003/auth/google/callback` and `https://orgflow.dev/auth/google/callback`. No JavaScript origin is needed for the server-side OAuth flow.
5. Save the client ID and secret to the existing Git-ignored `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Also set `GOOGLE_CLOUD_PROJECT=orgflow-20261011` and `GOOGLE_REDIRECT_URI=http://localhost:3003/auth/google/callback`. Preserve existing Luminal values. Keep the file owner-readable only (`chmod 600 backend/.env`). Do not commit credentials or paste them in chat.

The backend implements read-only OAuth (PKCE), Drive metadata sync, Docs/text/Gmail readers and consented text indexing. Production gets the client credentials from GitHub Actions secrets into the server-only `backend/.env`. OAuth tokens stay server-side in memory, so a restart requires reconnecting. This connection is not staff sign-in.

Troubleshooting: `redirect_uri_mismatch` means the exact redirect URI is not saved in the client's Authorized redirect URIs (an API probe reaching Google sign-in does not prove it is saved). Only listed test users can consent while the app is in Testing; going beyond that requires Google verification of the restricted scopes (see [OPEN_QUESTIONS](OPEN_QUESTIONS.md) item 14).

Official instructions: [consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent), [web client credentials](https://developers.google.com/workspace/guides/create-credentials).
