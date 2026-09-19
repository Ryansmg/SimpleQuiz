import { request as httpsRequest } from "node:https";

/**
 * The school's AAAA DNS lookup times out from Railway while its A record works.
 * Resolve IPv4 for this school only, preserve TLS/SNI validation, and use a fresh
 * HTTP/1.1 connection. This does not retry requests or change other API traffic.
 */
export const schoolFetch: typeof fetch = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.origin !== "https://student.gs.hs.kr" ||
    (init.method ?? "GET") !== "GET"
  ) {
    return Promise.reject(new Error("Unsupported school request"));
  }
  const headers = new Headers(init.headers);
  headers.set("Connection", "close");
  if (!headers.has("User-Agent")) headers.set("User-Agent", "DailyMath/1.0");
  if (!headers.has("Accept")) headers.set("Accept", "text/html");
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "GET",
        family: 4,
        agent: false,
        headers: Object.fromEntries(headers.entries()),
        signal: init.signal ?? AbortSignal.timeout(10_000),
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) {
            response.destroy(new Error("School response too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          const responseHeaders = new Headers();
          if (response.headers.location)
            responseHeaders.set("location", response.headers.location);
          if (response.headers["content-type"])
            responseHeaders.set(
              "content-type",
              response.headers["content-type"],
            );
          resolve(
            new Response(new Uint8Array(Buffer.concat(chunks)), {
              status: response.statusCode ?? 502,
              headers: responseHeaders,
            }),
          );
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
};
