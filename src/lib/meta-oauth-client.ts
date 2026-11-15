export function waitForMetaOAuth(popup: Window, state: string) {
  return new Promise<{ code: string; state: string }>((resolve, reject) => {
    const cleanup = () => { window.removeEventListener("message", receive); window.clearInterval(poll); window.clearTimeout(timeout); };
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.type !== "bedifly-meta-oauth" || event.data?.state !== state) return;
      cleanup();
      if (typeof event.data.code === "string" && !event.data.error) resolve({ code: event.data.code, state });
      else reject(new Error("Facebook authorization was declined or failed."));
    };
    const poll = window.setInterval(() => { if (popup.closed) { cleanup(); reject(new Error("Facebook window closed before authorization completed.")); } }, 500);
    const timeout = window.setTimeout(() => { cleanup(); popup.close(); reject(new Error("Facebook authorization expired. Try again.")); }, 10 * 60_000);
    window.addEventListener("message", receive);
  });
}