/** Cloudflare Turnstile's public site key. Unset locally, where the API skips the bot check too. */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

interface Turnstile {
  render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "error-callback": () => void; "timeout-callback": () => void }) => string;
  remove: (id: string) => void;
}

let script: Promise<Turnstile> | undefined;
function load() {
  return (script ??= new Promise<Turnstile>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => resolve((window as unknown as { turnstile: Turnstile }).turnstile);
    el.onerror = () => {
      script = undefined;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(el);
  }));
}

/**
 * A fresh "this is a person" token for one request, or undefined when no site key is set. Tokens are
 * single use, so each send asks for its own. The widget sits bottom-left and usually passes unseen;
 * when it wants a tap, it shows there.
 */
export async function turnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  const turnstile = await load();
  const box = document.createElement("div");
  box.className = "fixed bottom-4 left-4 z-50";
  document.body.appendChild(box);
  return new Promise<string>((resolve, reject) => {
    const done = (finish: () => void) => {
      turnstile.remove(id);
      box.remove();
      finish();
    };
    const fail = () => done(() => reject(new Error("turnstile")));
    const id = turnstile.render(box, { sitekey: SITE_KEY, callback: (token) => done(() => resolve(token)), "error-callback": fail, "timeout-callback": fail });
  });
}
