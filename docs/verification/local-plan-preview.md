# Local Month plan rehearsal

In your local clone of `https://github.com/koseny/jobtracker`, switch to the merged `main` branch and update it. Run these commands from the folder containing `package.json`:

```sh
git switch main
git pull --ff-only origin main
ls package-lock.json preview.html
npm ci
npm run dev
```

If `ls` reports a missing file, check the current folder with `pwd` and confirm that it is the updated `jobtracker` clone. `npm ci` needs the tracked `package-lock.json`; it will give an EUSAGE error when run from a folder without that file. If you do not yet have a clone, run `git clone https://github.com/koseny/jobtracker.git`, then `cd jobtracker` before the commands above.

Open `http://localhost:5173/preview.html`. The page opens the dormant Home Cash Flow Month workspace with three sample plan items. Use **Add** in Income or Spending, the row action to edit name/date or revise amount, the arrow buttons to move a row, and the two-step cancellation control. Refresh to check persistence.

This preview uses the dedicated `civilbonus-hcf-local-plan-preview-v2` IndexedDB database in that browser profile. Its sample plans are created once; later visits retain edits. It has a local rehearsal identity, no Google sign-in, no backend connection, and no production data. To start fresh, clear site data for localhost in the browser.

`preview.html` is a Vite development entry and is excluded from the production build. The public `civilbonus.com` entry remains `index.html` and the existing AuthShell. This slice does not publish the dormant UI to `hcf.civilbonus.com`.
