# Saborosa Games — studio website

Mockup marketing site for the studio, built as a plain Node.js + Express app so it
drops straight onto Hostinger's Node hosting.

## Run locally

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, with --watch reload
```

Built and tested on **Node v20.19.4** (npm 11.6.0). `package.json` declares `engines: node >=18`.

## Layout

```
server.js            Express: static hosting, /api/subscribe stub, /healthz, 404
public/
  index.html         The whole site — hero, games, studio, devlog, contact
  404.html
  css/style.css      Hand-drawn ink & kraft design system (CSS variables at the top)
  js/main.js         Signup form handling, footer year
  img/               Art pulled from the game repo, downscaled for web
```

No build step, no bundler, no framework — edit the files and reload.

## Art

Images are optimized copies of real assets from `../saborosa`:

| File | Source | Used for |
|---|---|---|
| `title-saborosa.png` | `assets/intro-title.png` | Hero wordmark |
| `band-doodles.jpg` | `assets/intro-bg.jpg` | Scrolling hero backdrop |
| `island.jpg` | `assets/cor-saborosa-fundo-fim-island-01-combined.png` | Saborosa card |
| `island-zones.jpg` | `assets/saborosa-fundo-base-V2.png` | Color-zone inset |
| `dungeon-bg.jpg` | `assets-v2/saborosa-dungeon-fundo-novo.png` | Flying Dungeon card |
| `plane-*.png` | `assets-v2/flying-dungeon/character-sheets/` | Floating planes, stickers |
| `fruit-select.png` | `assets/fruit-select-04-low.png` | Studio section |

Regenerate them by re-running the downscale step against the game repo if the source art changes.

## Deploy to Hostinger

In hPanel → **Websites → Node.js app**:

| Setting | Value |
|---|---|
| Package manager | `npm` |
| Entry file | `server.js` |
| Install command | `npm install` |
| Build command | *(leave empty — there is no build step)* |
| Output directory | *(leave empty — this is a server app, not a static build)* |
| Node version | 18 or newer (20 recommended) |

The app reads `process.env.PORT` and binds `0.0.0.0`, which is what Hostinger's proxy expects.
Don't hardcode a port. `GET /healthz` returns `ok` for uptime checks.

## Still mocked up

- Devlog posts are placeholder cards linking to `#` — no CMS or post pages yet.
- Store links ("Wishlist soon", "Play on itch.io") point at `#contact`; swap in real URLs.
- Footer social links are placeholders.
- `POST /api/subscribe` validates the address and logs it to stdout. It does **not**
  persist or send anything — wire it to Mailchimp/Buttondown/a database before launch.
- `hello@saborosa.games` is invented copy; replace with the real inbox.
