import { mkdirSync } from "node:fs";
const directory = new URL("./data/uploads/", import.meta.url);
const types: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export async function uploads(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (path === "/api/uploads" && req.method === "POST") {
    let form: Awaited<ReturnType<Request["formData"]>>;
    try {
      form = await req.formData();
    } catch {
      return Response.json(
        { error: "Expected multipart form data" },
        { status: 400 },
      );
    }
    const file = form.get("file");
    if (!(file instanceof File) || !types[file.type])
      return Response.json(
        { error: "Upload PNG, JPEG, WebP or GIF only" },
        { status: 400 },
      );
    if (file.size > 5_000_000)
      return Response.json(
        { error: "Maximum image size is 5 MB" },
        { status: 413 },
      );
    const data = new Uint8Array(await file.arrayBuffer());
    const png =
      data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71;
    const jpg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const gif = String.fromCharCode(...data.slice(0, 6)).startsWith("GIF8");
    const webp =
      String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...data.slice(8, 12)) === "WEBP";
    if (
      !{
        "image/png": png,
        "image/jpeg": jpg,
        "image/gif": gif,
        "image/webp": webp,
      }[file.type]
    )
      return Response.json(
        { error: "Image bytes do not match content type" },
        { status: 400 },
      );
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const name = `${crypto.randomUUID()}.${types[file.type]}`;
    await Bun.write(new URL(name, directory), data);
    return Response.json({ url: `/api/uploads/${name}` }, { status: 201 });
  }
  if (path.startsWith("/api/uploads/") && req.method === "GET") {
    const name = path.slice("/api/uploads/".length);
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(name))
      return Response.json({ error: "Not found" }, { status: 404 });
    const file = Bun.file(new URL(name, directory));
    if (!(await file.exists()))
      return Response.json({ error: "Not found" }, { status: 404 });
    return new Response(file, {
      headers: {
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=86400",
      },
    });
  }
  return null;
}
