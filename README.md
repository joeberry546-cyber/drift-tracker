# Drift

A private, personal tracker for logging how masculine or feminine you feel
throughout the day, with a table view, a color-coded calendar, and a Trends
tab that shows how much your feeling moves.
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

- `index.html` / `styles.css` / `app.js` — the front end: the 7-point slider,
  table view, calendar view, deleting entries, and adding a log to a past day.
- `trends.js` — the Trends tab. All charts are hand-drawn SVG (no libraries):
  day-to-day change, trend with daily range, a 7-day "how much am I moving"
  line, weekday x time-of-day heatmap, a year of daily squares, and a
  "stickiness" grid (how often one day's feeling carries into the next).
- `netlify/functions/entries.js` — a serverless function that reads and
  writes your entries to Netlify Blobs. It has no access control, so
  treat the deployed URL as unlisted rather than truly private.
- `manifest.json` / `sw.js` / `icons/` — make the app installable as a
  home-screen PWA, with a basic offline app shell.

## Notes

- Entries can be deleted but not edited, by design. To fix a mistake, delete the
  entry (there's a few seconds to Undo) and add it again.
- To log something you missed, open the Calendar, tap the day (any past day,
  even an empty one), and choose "Add a log for this day". These entries get an
  "added later" tag. Future days can't be logged.
- Multiple entries per day are supported — each one is timestamped, and
  the calendar shows the most recent entry for any day with more than one.
- If you'd like to add real protection later (a proper login, or
  Netlify Identity), that's a bigger change but doable — just let me know.
