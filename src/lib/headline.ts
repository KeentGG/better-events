/** The longest headline a feed card shows. The desk's Headline field stops sooner, at 120. */
export const TITLE_MAX = 140;

/**
 * A headline that fits, with nothing lost: a title over `max` is cut at the last sentence end before it, or failing
 * that the last word, and the rest leads the body. Older clients and scripts send one long line, and cutting it
 * at 140 used to drop everything after.
 */
export function fitHeadline(title: string, body = "", max = TITLE_MAX): { title: string; body: string } {
  const t = title.trim();
  if (t.length <= max) return { title: t, body: body.trim() };
  const head = t.slice(0, max);
  // A sentence end (or a dash between clauses) far enough in to make a headline.
  const sentence = Math.max(...[". ", "! ", "? ", " — ", " – "].map((s) => head.lastIndexOf(s)));
  const word = head.lastIndexOf(" ", max - 1);
  const whole = sentence >= max / 3;
  const cut = whole ? sentence + 1 : word > 0 ? word : max - 1;
  let first = t.slice(0, cut).trim();
  let rest = t.slice(cut).trim().replace(/^[—–]\s*/, "");
  // Mid-sentence, both halves say the thought goes on; a dangling bracket or comma is dropped from the title end.
  if (!whole) {
    first = `${first.replace(/[\s([{,;:—–-]+$/, "")}…`;
    rest = `…${rest}`;
  }
  return { title: first, body: [rest, body.trim()].filter(Boolean).join("\n\n") };
}

/** The desk's notice text, one box: the first line is the headline and the rest the details. */
export function splitNotice(text: string): { title: string; body: string } {
  const [first, ...rest] = text.split("\n");
  return fitHeadline(first, rest.join("\n"));
}
