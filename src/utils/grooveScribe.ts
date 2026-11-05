const embedPage = "https://montulli.github.io/GrooveScribe/GrooveEmbed.html";
const shortLinkBase = "https://gscribe.com/share/";
const shortCodePattern = /^[\w-]{1,128}$/;
const noteTracks = new Set(["h", "s", "k", "t1", "t2", "t3", "t4", "stickings"]);

export function getGrooveScribeLink(value: unknown) {
  if (typeof value !== "string") return null;
  const original = value.trim();
  if (!/^https?:\/\//i.test(original) || /[\s\\]/.test(original)) return null;

  let url: URL;
  try {
    url = new URL(original);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;

  const isEditorOrEmbed =
    (url.hostname === "montulli.github.io" && /^\/GrooveScribe(?:\/(?:index\.html|GrooveEmbed\.html)?)?$/.test(url.pathname)) ||
    (["mikeslessons.com", "www.mikeslessons.com"].includes(url.hostname) &&
      /^\/(?:groove|gscribe)(?:\/(?:index\.html|GrooveEmbed\.html)?)?$/.test(url.pathname));
  const shortCode = url.hostname === "gscribe.com" ? /^\/share\/([^/]+)\/?$/.exec(url.pathname)?.[1] : undefined;
  if (shortCode && shortCodePattern.test(shortCode)) {
    return { original, embed: `/api/groove-scribe-preview?code=${shortCode}` };
  }
  if (!isEditorOrEmbed) return null;

  let embed: string | null = null;
  if (Array.from(url.searchParams).some(([key, notes]) => noteTracks.has(key.toLowerCase()) && notes)) {
    try {
      // The embed decodes URL fields itself. Leave the serialized query intact.
      decodeURIComponent(url.search);
      embed = embedPage + url.search;
    } catch {
      // A malformed encoded groove can still be opened at its original address.
    }
  }

  return { original, embed };
}

export async function resolveGrooveScribePreview(code: string, request = fetch): Promise<string | null> {
  if (!shortCodePattern.test(code)) return null;

  try {
    // Read the share service's redirect without following it to the editor.
    const response = await request(shortLinkBase + code, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return null;

    const embed = getGrooveScribeLink(response.headers.get("location"))?.embed;
    return embed?.startsWith(embedPage + "?") ? embed : null;
  } catch {
    return null;
  }
}
