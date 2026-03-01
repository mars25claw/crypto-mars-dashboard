# 🪙 Crypto Mars Dashboard

Private trading dashboard hosted on GitHub Pages.

## Access

Visit: `https://{username}.github.io/crypto-mars-dashboard/`

Password: stored as SHA-256 hash in `index.html`

## Architecture

- **Frontend**: Pure static HTML/CSS/JS (no server needed)
- **Data**: JSON files in `data/` directory, updated by Mac mini
- **Hosting**: GitHub Pages (free, always online)
- **Updates**: Mac mini pushes every 10 minutes via cron

## Data Files

| File | Contents |
|------|----------|
| `data/meta.json` | Last update timestamp |
| `data/status.json` | Account equity + positions |
| `data/stats.json` | Trade statistics |
| `data/journal.json` | Trade history |
| `data/sniper.json` | Latest confluence scan |
| `data/correlation.json` | Market correlation |
| `data/levels.json` | S/R levels for all coins |
| `data/alerts.json` | Alert history |

## Update Script

Run on Mac mini:
```bash
/Users/marswithpower/.openclaw/workspace-crypto-mars/dashboard/update-dashboard.sh
```

## Cron

```
*/10 * * * * /Users/marswithpower/.openclaw/workspace-crypto-mars/dashboard/update-dashboard.sh >> /tmp/crypto-mars-update.log 2>&1
```
