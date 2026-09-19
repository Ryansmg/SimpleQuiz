import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";

/**
 * School DNS resolution is unreliable from overseas resolvers. Deployments may
 * configure the independently verified school IPv4 address while preserving the
 * original URL, Host, TLS/SNI and certificate validation. Only school requests use
 * this override; connections are fresh HTTP/1.1 requests, without automatic retries.
 */
export const schoolFetch: typeof fetch = (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (
    url.origin !== "https://student.gs.hs.kr" ||
    (init.method ?? "GET") !== "GET"
  ) {
    return Promise.reject(new Error("Unsupported school request"));
  }
  const address = process.env.DAILYMATH_SCHOOL_IPV4?.trim();
  if (address && isIP(address) !== 4) {
    return Promise.reject(new Error("Invalid configured school IPv4 address"));
  }
  const headers = new Headers(init.headers);
  headers.set("Connection", "close");
  if (!headers.has("User-Agent")) headers.set("User-Agent", "DailyMath/1.0");
  if (!headers.has("Accept")) headers.set("Accept", "text/html");
  return new Promise<Response>((resolve, reject) => {
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      method: "GET",
      family: 4,
      autoSelectFamily: false,
      agent: false,
      ...(address
        ? {
            lookup: (_host, _options, callback) => callback(null, address, 4),
          }
        : {}),
      headers: Object.fromEntries(headers.entries()),
      signal: init.signal ?? AbortSignal.timeout(10_000),
    };
    const request = httpsRequest(url, options, (response) => {
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
          responseHeaders.set("content-type", response.headers["content-type"]);
        try {
          const status = response.statusCode ?? 502;
          resolve(
            new Response(
              status === 204 || status === 304
                ? null
                : new Uint8Array(Buffer.concat(chunks)),
              {
                status,
                headers: responseHeaders,
              },
            ),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on("error", reject);
    request.end();
  });
};
