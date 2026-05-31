/**
 * Shared utilities used by both coversParser.js and consensus.js.
 * Centralising these here removes the two identical copies that previously
 * lived in each file.
 */

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  rsquo: "\u2019",
  lsquo: "\u2018",
  rdquo: "\u201d",
  ldquo: "\u201c",
  ndash: "\u2013",
  mdash: "\u2014"
};

/** Decode HTML character references to their Unicode equivalents. */
export function decodeEntities(value) {
  return `${value}`
    .replace(/&([a-z]+);/gi, (_, entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? `&${entity};`)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

/** Fetch a page with browser-like headers. Throws on non-2xx responses. */
export async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }

  return response.text();
}
