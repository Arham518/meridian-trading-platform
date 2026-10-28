# Deploying Meridian on Hostless

Meridian runs as **one app** on Hostless: `npm run build` builds the React client, and `npm start` starts Express,
which serves the client, the `/api` routes and socket.io (live signals) on `$PORT`, bound to `0.0.0.0`.

Free Hostless apps get only a **temporary disk**. Persistent volumes need a payment method. So the data is kept in a
**Hostless PostgreSQL database**. Set `DATABASE_URL` and the server will:
- rebuild its working SQLite database from PostgreSQL every time it starts;
- write every change to PostgreSQL *before* it answers the request, so nothing you confirmed is lost on a redeploy or crash;
- store uploaded signal images and the hero video in PostgreSQL too.

The Excel file `records.xlsx` is rebuilt from the database whenever it is needed. Run **one replica only**.

Docs: [Express guide](https://docs.hostless.cloud/javascript/express), [hostless.yaml](https://docs.hostless.cloud/app/hostlessfile),
[CLI](https://docs.hostless.cloud/cli), [databases](https://docs.hostless.cloud/databases/create), [free tier](https://docs.hostless.cloud/plans/free-tier).

## Settings (already in `hostless.yaml`, which Hostless reads from the repo root)

| Setting | Value |
|---|---|
| Build system | auto (Node detected from `package.json`; Node >= 22.13, `.nvmrc` = 24) |
| Working directory | `/` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | HTTP `/api/health` |
| Scaling | 1 replica, max 0.25 vCPU, max 512 MB (the database uses the other half of the free pool) |

## Environment variables

| Name | Value |
|---|---|
| `DATABASE_URL` | Connection string of the Hostless PostgreSQL database (`postgresql://user:pass@host:5432/db?sslmode=require`). Added automatically if you link the database to the app |
| `JWT_SECRET` | Required. 64+ random characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Never change it later, because that signs everyone out and breaks saved 2FA |
| `NODE_ENV` | `production` |
| `APP_URL` | The app's public `https://…` URL (shown after the app is created). This turns on Secure cookies and fixes the links in emails |
| `ADMIN_EMAIL` | Your admin login email |
| `ADMIN_PASSWORD` | A strong password. Changing it later and redeploying sets the new password (and signs that admin out). While it stays the same, a password changed on the Account page is kept |
| `SEED_DEMO` | `false` for a clean site (`true` adds labelled demo data) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Real email for verification and password reset. Gmail: `smtp.gmail.com`, `587`, your address, a 16-character App Password |
| `REQUIRE_EMAIL_VERIFICATION` | Optional. `false` until SMTP works, otherwise new members can't verify |
| `REQUIRE_ADMIN_2FA` | Optional, `true` recommended |
| `DATABASE_SSL` | Optional. Set `no-verify` only if the start-up log shows a TLS certificate error |

Do **not** set `PORT`, because Hostless sets it. `CORS_ORIGINS` is not needed because the client and API share one origin.

## Steps from Windows (PowerShell)

1. Push this code to GitHub `main`. Hostless deploys from GitHub:
   ```
   cd C:\Users\Arham\Desktop\meridian_trading
   git add -A
   git commit -m "Hostless deploy: PostgreSQL persistence, hostless.yaml"
   git push origin main
   ```
2. Install the Hostless CLI. The Windows build is listed at https://hostless.cloud/cli/latest.json:
   ```
   New-Item -ItemType Directory -Force "$env:USERPROFILE\hostless" | Out-Null
   Invoke-WebRequest https://hostless.cloud/cli/latest/hostless-windows-x64.exe -OutFile "$env:USERPROFILE\hostless\hostless.exe"
   $env:Path += ";$env:USERPROFILE\hostless"
   hostless --version
   ```
3. Log in. This opens the Hostless consent page in your browser; approve it there: `hostless auth login`.
   The first time, connect GitHub in the Hostless dashboard so Hostless can read `Arham518/meridian-trading-platform`.
4. Create the database. The CLI has no database command, so use the dashboard: https://hostless.cloud/databases/new →
   PostgreSQL, name `meridian-db`, version latest, keep the defaults (0.25 vCPU / 512 MiB / 512 MiB storage).
   If the app already exists, choose **Link to an app** → `meridian-trading-platform`, and `DATABASE_URL` is added for you.
5. Create the app from the repo folder: `hostless create app meridian-trading-platform --wait`.
   Until the variables are set this first run keeps data only in temporary storage, so do not use it yet.
6. Set the variables, then redeploy:
   ```
   hostless env set --app meridian-trading-platform NODE_ENV=production JWT_SECRET=<generated> ADMIN_EMAIL=<you> ADMIN_PASSWORD=<strong> SEED_DEMO=false APP_URL=https://<app-url>
   hostless env set --app meridian-trading-platform DATABASE_URL="<connection string>"   # skip if you linked it in step 4
   hostless env set --app meridian-trading-platform SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_USER=<gmail> SMTP_PASS=<app password> MAIL_FROM="Meridian <gmail>" --deploy
   hostless deploy --app meridian-trading-platform --wait
   hostless logs --app meridian-trading-platform -f
   ```
   `hostless info app meridian-trading-platform` shows the URL to use for `APP_URL`.
   The log should show `[persist] restored …` and `[persist] saved full copy`.
7. Check the site: open the URL, register, sign in as admin at `/admin`, and publish a signal (it should appear live
   in a second browser). Then run `hostless deploy --app meridian-trading-platform --wait` again: the user and signal must still be there.

After this, every `git push origin main` redeploys automatically.

Instead of the browser login, you can create an API key in Account → Settings → API Keys and put it in `$env:HOSTLESS_TOKEN`.
Never commit it. The REST API (`https://api.hostless.cloud/v1`) can also create databases with `POST /databases` (scope `databases:write`).
