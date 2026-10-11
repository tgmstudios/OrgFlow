import React from "react";
import { hydrateRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { DOCUMENT_TITLE } from "../backend/branding";

document.title = DOCUMENT_TITLE;

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (this.state.failed)
      return (
        <main className="error-page">
          <h1>Your knowledge has a home.</h1>
          <p>The preview could not load. You can still open OrgFlow.</p>
          <a className="button button-primary" href="https://orgflow.dev/a/">
            Open OrgFlow
          </a>
        </main>
      );
    return this.props.children;
  }
}
hydrateRoot(
  document.getElementById("root")!,
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
