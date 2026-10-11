import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const PDF_MIME = "application/pdf";
export const WORD_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
export const MAX_DOCUMENT_BYTES = 4_000_000;
export const MAX_TEXT_CHARACTERS = 30_000;

/**
 * Extract selectable PDF text or Word paragraph text on the server.
 * No OCR, images, PDF scripts, or executable Office content are processed.
 * Binary payloads are capped before they reach a document parser.
 */
export async function extractDocumentText(mimeType: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds 4 MB extraction limit");
  if (mimeType === PDF_MIME) {
    const document = await getDocumentProxy(bytes);
    try {
      if (document.numPages > 75) throw new Error("PDF exceeds 75 page indexing limit");
      const {text} = await extractText(document, {mergePages:true});
      return text.slice(0, MAX_TEXT_CHARACTERS).trim();
    } finally {
      await (document as unknown as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
    }
  }
  if (mimeType === WORD_MIME) {
    const {value} = await mammoth.extractRawText({buffer: Buffer.from(bytes)});
    return value.slice(0,MAX_TEXT_CHARACTERS).trim();
  }
  throw new Error("This file format does not support binary text extraction");
}