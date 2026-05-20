# tools/

Maintainer scripts. Not bundled with the app.

## scrape-dp-items.mjs

Re-crawls divine-pride.net to refresh `public/db/dp-item.json`. Run this
when "Item 12345" / "Carta 12345" fallbacks start showing up in the app —
that means new items have been added to the DP database since the last
snapshot.

### Setup

1. Log into [www.divine-pride.net](https://www.divine-pride.net) in any
   browser (a free account is enough for the public item list — no
   premium needed).
2. Open DevTools → Application → Cookies → `www.divine-pride.net`.
3. Copy the values of `.ASPXAUTH` and `ASP.NET_SessionId`.

### Run

```powershell
$env:DP_ASPXAUTH = "<paste .ASPXAUTH value>"
$env:DP_ASPNET_SESSION = "<paste ASP.NET_SessionId value>"
node tools/scrape-dp-items.mjs
```

Optional: `$env:DP_LANG = "en"` (default `pt`).

The script throttles to 2 requests/second and walks every page sequentially.
Expect ~5-10 minutes for the full ~320 pages. Progress is written
incrementally to `public/db/dp-item.json.new`; only after the last page
succeeds does it get renamed over the shipped JSON.

If cookies expire mid-run, the script aborts and leaves `.new` in place
so the next run can resume after re-grabbing fresh cookies (current
implementation re-starts from page 1 either way — pagination is cheap
enough that resumability isn't worth the complexity).

### Verifying the result

```powershell
git diff --stat public/db/dp-item.json
```

You should see mostly additions and a few renames. After the update, run
`npm run tauri dev` and confirm items that previously rendered as
"Item NNNN" now have real names.
