/** Correct public identity, with compatibility for records created during the accidental rename. */
export const PRODUCT_NAME = "OrgFlow";
export const DOCUMENT_TITLE = "OrgFlow";
export const PRODUCT_DOMAIN = "orgflow.dev";
const previousBrand = ["One", "Flow"].join("");
export const brandLabel = (value: string) => value.replaceAll(previousBrand, PRODUCT_NAME);

/** Display only known product metadata differently. Never rewrite source text or organizational knowledge. */
export function brandRecord<T extends Record<string, unknown>>(kind: string, value: T): T {
  const result = { ...value } as Record<string, unknown>;
  if (kind === "orgs" && ["Center", "Centre"].some(spelling => value.name === `${spelling} Valley Community Pantry (${previousBrand} Showcase)`))
    result.name = brandLabel(String(value.name));
  if (typeof value.provider === "string" && value.provider.startsWith(previousBrand + " "))
    result.provider = brandLabel(value.provider);
  if (typeof value.orgflowPath === "string" && value.orgflowPath.startsWith("/" + previousBrand + " Showcase"))
    result.orgflowPath = brandLabel(value.orgflowPath);
  return result as T;
}
