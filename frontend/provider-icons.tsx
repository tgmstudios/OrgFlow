import React from "react";
import { FileText, FolderOpen, Image as ImageIcon, Mail, Table2, FileArchive } from "lucide-react";
import drive from "./assets/google-drive.png";
import gmail from "./assets/google-gmail.png";
import docs from "./assets/google-docs.png";
import sheets from "./assets/google-sheets.png";
import microsoft from "./assets/microsoft.svg";
import knot from "./brand-knot.webp";

/** Brand marks are locally hosted (Google product icons from Google's gstatic assets).
 * Displayed only for the real provider. Demo examples are never labeled as Google content.
 */
export function ProviderIcon({
  provider,
  size = 22,
  className = "",
}: {
  provider: string;
  size?: number;
  className?: string;
}) {
  const normalized = provider.toLowerCase().trim();
  const icon =
    normalized === "google drive" || normalized === "drive" ? drive :
    normalized === "gmail" ? gmail :
    normalized === "google docs" ? docs :
    normalized === "google sheets" ? sheets :
    ["microsoft 365", "sharepoint", "onedrive", "outlook"].includes(normalized) ? microsoft :
    ["orgflow showcase", "orgflow showcase"].includes(normalized) ? knot :
    null;

  if (icon) {
    return <img
      className={`provider-icon ${className}`.trim()}
      src={icon}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
    />;
  }
  if (normalized === "demo mail")
    return <Mail className={className} size={size} aria-hidden="true" />;
  return <FolderOpen className={className} size={size} aria-hidden="true" />;
}

/** File badges describe actual formats, not integration status or source authenticity. */
export function DocumentIcon({ filename, size = 25 }: { filename: string; size?: number }) {
  const extension = filename.split(".").pop()?.toLowerCase() || "";
  if (extension === "pdf") return <span className="document-format document-pdf" aria-hidden="true">PDF</span>;
  if (extension === "docx" || extension === "doc") return <span className="document-format document-word" aria-hidden="true">W</span>;
  if (extension === "csv" || extension === "xlsx" || extension === "xls") return <span className="document-format document-sheet" aria-hidden="true"><Table2 size={size * .6} /></span>;
  if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) return <ImageIcon size={size} aria-hidden="true" />;
  if (["zip", "epub"].includes(extension)) return <FileArchive size={size} aria-hidden="true" />;
  return <FileText size={size} aria-hidden="true" />;
}

export function ProductMark({ size = 30 }: { size?: number }) {
  return <img src={knot} width={size} height={size} className="orgflow-brand-mark" alt="" aria-hidden="true" decoding="async" />;
}
