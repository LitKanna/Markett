const UPSTREAM = "https://litkanna.github.io/Markett";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Canonical: force https and apex host
    if (url.protocol === "http:" || url.hostname.startsWith("www.")) {
      url.protocol = "https:";
      if (url.hostname.startsWith("www.")) url.hostname = url.hostname.slice(4);
      return Response.redirect(url.toString(), 301);
    }

    const upstreamUrl = UPSTREAM + url.pathname + url.search;
    const upstreamResp = await fetch(upstreamUrl, {
      method: request.method,
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "yolko-edge",
        "Accept": request.headers.get("Accept") || "*/*",
        "Accept-Encoding": request.headers.get("Accept-Encoding") || "",
      },
      redirect: "manual",
    });

    // Rewrite any GitHub redirects back onto our domain
    if (upstreamResp.status >= 301 && upstreamResp.status <= 308) {
      const location = upstreamResp.headers.get("Location") || "";
      const rewritten = location
        .replace("https://litkanna.github.io/Markett", "https://getyolko.com")
        .replace("https://litkanna.github.io", "https://getyolko.com");
      const headers = new Headers(upstreamResp.headers);
      headers.set("Location", rewritten);
      return new Response(null, { status: upstreamResp.status, headers });
    }

    const headers = new Headers(upstreamResp.headers);
    headers.delete("X-GitHub-Request-Id");
    headers.delete("X-Served-By");
    headers.delete("X-Fastly-Request-ID");

    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      headers,
    });
  },
};
