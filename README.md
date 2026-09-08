# Drift

A private, personal tracker for logging how masculine or feminine you feel
throughout the day, with a table view and a color-coded calendar view.
Built to run on Netlify with Netlify Blobs for storage, so your entries
sync across every device.

**No login screen.** Anyone who has the URL can view or add entries —
the only thing keeping this private is that nobody else knows the URL
exists. Don't share the link, and treat it like you would any unlisted
personal page.

## Deploy it

1. **Drag-and-drop the whole `tracker` folder** into Netlify's deploy
   screen at app.netlify.com (or push it to a GitHub repo and connect
   that instead — either works). Netlify will detect `netlify.toml`
   automatically — no build command needed, since this is a static site
   with one serverless function.

2. **Deploy.** Netlify Blobs works automatically on Netlify's own
   infrastructure — no extra setup, no separate account, and it's included
   in the free tier.

3. **Add it to your home screen.** Open the deployed URL on your phone in
   Safari or Chrome, then use "Add to Home Screen" — it'll install as a
   standalone app icon (no browser bar) using the tree-and-blossom icon.

To redeploy later (e.g. after an edit), re-drag the folder into the same
deploy box on your project's Deploys tab.

## How it works

- `index.html` / `styles.css` / `app.js` — the whole front end: passcode
  screen, the 7-point slider, table view, and calendar view.
- `netlify/functions/entries.js` — a serverless function that reads and
  writes your entries to Netlify Blobs. It has no access control, so
  treat the deployed URL as unlisted rather than truly private.
- `manifest.json` / `sw.js` / `icons/` — make the app installable as a
  home-screen PWA, with a basic offline app shell.

## Notes

- Entries can't be edited or deleted once logged, by design.
- Multiple entries per day are supported — each one is timestamped, and
  the calendar shows the most recent entry for any day with more than one.
- If you'd like to add real protection later (a proper login, or
  Netlify Identity), that's a bigger change but doable — just let me know.
