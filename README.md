# Match-3 Dogs 🐶

A cozy match-3 puzzle game starring pups. Pure HTML/CSS/JS — no build step,
no dependencies. Runs on desktop (click two adjacent tiles) and mobile
(tap or swipe).

## Play locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

Pushes to `main` (or the active feature branch) trigger
`.github/workflows/pages.yml`, which publishes the site to GitHub Pages.
Enable Pages once in **Settings → Pages → Build and deployment → Source:
GitHub Actions**.

## How to play

- Swap two adjacent dogs to make a row/column of 3 or more of the same kind.
- Each match scores points; chain reactions multiply the payout.
- You have 30 moves per game. Beat your best!
