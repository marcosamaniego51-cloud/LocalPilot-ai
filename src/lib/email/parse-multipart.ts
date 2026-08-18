/**
 * Minimal multipart/form-data parser for SendGrid's Inbound Parse webhook
 * (Task 6.5), built on `busboy`. SendGrid POSTs inbound emails as
 * multipart form fields (from, to, subject, text, html, envelope, etc.)
 * rather than JSON, so this is needed to read them out of a Next.js
 * Request in the Node runtime.
 */

import Busboy from "busboy";
import { Readable } from "node:stream";

export async function parseMultipartFields(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Expected multipart/form-data content type");
  }

  const fields: Record<string, string> = {};

  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  const nodeStream = Readable.from(bodyBuffer);

  await new Promise<void>((resolve, reject) => {
    const bb = Busboy({ headers: { "content-type": contentType } });

    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    // Inbound Parse can include attachment files too — not needed for
    // this system's use case (text/HTML body + sender/subject), so
    // attachment streams are drained and discarded rather than buffered.
    bb.on("file", (_name, file) => {
      file.resume();
    });
    bb.on("error", reject);
    bb.on("finish", resolve);

    nodeStream.pipe(bb);
  });

  return fields;
}
