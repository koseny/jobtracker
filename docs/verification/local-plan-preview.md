# Local Month plan rehearsal

From the repository root:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173/preview.html`. The page opens the dormant Home Cash Flow Month workspace with three sample plan items. Use **Add** in Income or Spending, the row action to edit name/date or revise amount, the arrow buttons to move a row, and the two-step cancellation control. Refresh to check persistence.

This preview uses the dedicated `civilbonus-hcf-local-plan-preview-v2` IndexedDB database in that browser profile. Its sample plans are created once; later visits retain edits. It has a local rehearsal identity, no Google sign-in, no backend connection, and no production data. To start fresh, clear site data for localhost in the browser.

`preview.html` is a Vite development entry and is excluded from the production build. The public `civilbonus.com` entry remains `index.html` and the existing AuthShell. This slice does not publish the dormant UI to `hcf.civilbonus.com`.
