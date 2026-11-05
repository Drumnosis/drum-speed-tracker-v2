import test from "node:test";
import assert from "node:assert/strict";
import { getGrooveScribeLink, resolveGrooveScribePreview } from "../src/utils/grooveScribe.ts";

const embed = "https://montulli.github.io/GrooveScribe/GrooveEmbed.html";
const groove = "?TimeSig=4/4&Div=16&Title=A%20%2B%20B%26C&H=|x-x-x-x-x-x-x-x-|&S=%7C----o-------o---%7C";

test("uses the read-only embed and retains the original share URL and groove encoding", () => {
  const original = `https://www.mikeslessons.com/groove/${groove}#bookmark`;
  assert.deepEqual(getGrooveScribeLink(original), { original, embed: embed + groove });
});

test("recognizes the upstream editor, embed, and Mike's Lessons legacy share path", () => {
  for (const path of [
    "https://montulli.github.io/GrooveScribe/",
    "https://montulli.github.io/GrooveScribe/index.html",
    embed,
    "http://mikeslessons.com/gscribe",
  ]) {
    const original = path + "?k=|o---------------|";
    assert.deepEqual(getGrooveScribeLink(`  ${original}  `), {
      original,
      embed: embed + "?k=|o---------------|",
    });
  }
});

test("keeps a link-only fallback for missing note data and invalid groove encoding", () => {
  for (const original of [
    "https://montulli.github.io/GrooveScribe/?Div=16",
    `https://montulli.github.io/GrooveScribe/${groove}&Comments=%FF`,
  ]) {
    assert.deepEqual(getGrooveScribeLink(original), { original, embed: null });
  }
});

test("resolves a Groove Scribe short link into the production embed for its full groove", async () => {
  const code = "A1b2C3d4E5f6G7h8";
  const original = `https://gscribe.com/share/${code}`;
  assert.deepEqual(getGrooveScribeLink(original), {
    original,
    embed: `/api/groove-scribe-preview?code=${code}`,
  });

  // Groove Scribe's 16th Note Rock preset in the encoded redirect format.
  const query = "?TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=%7Cxxxxxxxxxxxxxxxx%7C&S=%7C----O-------O---%7C&K=%7Co-------o-------%7C";
  const fullShare = `https://www.mikeslessons.com/groove/${query}`;
  assert.deepEqual(getGrooveScribeLink(fullShare), { original: fullShare, embed: embed + query });
  const preview = await resolveGrooveScribePreview(code, async (url, options) => {
    assert.equal(url, original);
    assert.equal(options.method, "HEAD");
    assert.equal(options.redirect, "manual");
    return Response.redirect(fullShare, 302);
  });
  assert.equal(preview, embed + query);
});

test("unavailable or unsafe short-link resolutions never produce an embed", async () => {
  let contacted = false;
  const invalid = await resolveGrooveScribePreview("../other", async () => {
    contacted = true;
    return new Response(null, { status: 404 });
  });
  assert.equal(invalid, null);
  assert.equal(contacted, false);

  for (const response of [
    new Response(null, { status: 404 }),
    new Response(null, { status: 302 }),
    Response.redirect("https://example.org/groove/?H=x", 302),
    Response.redirect("https://gscribe.com/share/OtherCode", 302),
  ]) {
    assert.equal(await resolveGrooveScribePreview("TestCode", async () => response), null);
  }
  assert.equal(await resolveGrooveScribePreview("TestCode", async () => {
    throw new Error("Offline");
  }), null);
});

test("rejects absent, malformed, untrusted, or non-web URLs", () => {
  for (const value of [
    null,
    "",
    42,
    "not a URL",
    "<iframe src='https://montulli.github.io/GrooveScribe/'>",
    "javascript:alert(1)",
    "//montulli.github.io/GrooveScribe/",
    "https://",
    "https://user:pass@montulli.github.io/GrooveScribe/",
    "https://montulli.github.io:8080/GrooveScribe/",
    "https://montulli.github.io.example.org/GrooveScribe/",
    "https://montulli.github.io/OtherProject/",
    "https://mikeslessons.com/other/",
    "https://montulli.github.io/GrooveScribe/?H=note\ntrack",
  ]) {
    assert.equal(getGrooveScribeLink(value), null, String(value));
  }
});
