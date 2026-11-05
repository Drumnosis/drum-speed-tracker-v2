import { resolveGrooveScribePreview } from "@/utils/grooveScribe";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const embed = await resolveGrooveScribePreview(code);
  const headers = { "Cache-Control": "no-store" };
  return embed
    ? new Response(null, { status: 302, headers: { ...headers, Location: embed } })
    : new Response("Preview unavailable. Use Open in Groove Scribe to view the original link.", {
      status: 404,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
}
