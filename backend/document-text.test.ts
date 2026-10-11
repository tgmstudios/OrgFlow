import { test, expect } from "bun:test";
import { join } from "node:path";
import { extractDocumentText, PDF_MIME, WORD_MIME, MAX_DOCUMENT_BYTES } from "./document-text";

const originals = join(import.meta.dir, "../demo-content/01_Google_Drive/Operations");
const pdf = Bun.file(join(originals, "Volunteer_Welcome_and_First_Shift.pdf"));
const docx = Bun.file(join(originals, "Volunteer_Welcome_and_First_Shift.docx"));

test("indexes meaningful selectable text from the complete demo PDF", async () => {
  const text = await extractDocumentText(PDF_MIME, new Uint8Array(await pdf.arrayBuffer()));
  expect(text.length).toBeGreaterThan(1000);
  expect(text).toContain("Volunteer Welcome and First Shift");
  expect(text).toContain("8:30");
  expect(text).toContain("Jordan Lee");
});
test("extracts complete Word document content without importing binary data", async () => {
  const text = await extractDocumentText(WORD_MIME, new Uint8Array(await docx.arrayBuffer()));
  expect(text.length).toBeGreaterThan(1000);
  expect(text).toContain("Volunteer Welcome and First Shift");
  expect(text).toContain("8:30");
});
test("refuses oversized or unsupported binary inputs", async () => {
  await expect(extractDocumentText(PDF_MIME, new Uint8Array(MAX_DOCUMENT_BYTES + 1))).rejects.toThrow("exceeds");
  await expect(extractDocumentText("image/png", new Uint8Array(15))).rejects.toThrow("not support");
});
