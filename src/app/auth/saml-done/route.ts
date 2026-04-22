import { NextResponse } from "next/server";

/**
 * SAML popup landing page. The popup opens on the provider's SAML SSO URL
 * with `?redirect=<this route>` so the browser lands here after
 * authenticating. We reply with a tiny HTML payload that closes the popup.
 * The main tab's poll in page.tsx detects the closure and continues the
 * OAuth handshake via /api/auth/signin?saml_done=1.
 *
 * `notifyOpener` also posts a message to the parent tab, which lets it
 * skip the 2s safety delay on the popup-closed poll.
 */
export async function GET() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Signing you in…</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      background: #0d0d0f;
      color: #eaeaea;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      text-align: center;
    }
    p { opacity: 0.7; font-size: 13px; }
  </style>
</head>
<body>
  <div>
    <p>Signed in. Closing&hellip;</p>
    <p>You can close this tab if it doesn't close automatically.</p>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: "gitcity:saml-done" }, "*");
      }
    } catch (_) {}
    // Give the message a tick to flush, then close.
    setTimeout(function () {
      try { window.close(); } catch (_) {}
    }, 100);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
