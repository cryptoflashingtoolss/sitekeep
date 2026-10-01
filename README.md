# SiteKeep

A private app for you and your team to keep every website's logins, tasks and setup checklist in one place, on **Windows and Android**, with **Blackbox AI** built in.

- **Logins per site**: wp-admin, hosting, cPanel, domain registrar, Search Console, Analytics, Bing, FTP, database, email, API keys. Reveal, copy (the clipboard clears itself), and generate strong passwords.
- **Tasks per site**: everything unfinished across all your sites shows at the top of Today right after you unlock, grouped into Overdue, Next 7 days and Later. Assign tasks to teammates and filter to "Assigned to me".
- **Setup checklist per site**: every new site starts with an SEO and ops checklist (GSC verified, sitemap submitted, GA4, backups, 2FA…). Tick items off, add your own, or ask the AI to suggest missing ones.
- **Reminders on your device**: notifications for tasks due today or overdue, and for domain, SSL and hosting renewals 14, 7, 3 and 1 days before. The app asks for permission the first time.
- **Team**: share a site as **Can edit** or **View only**. Admins invite people, manage admins and help locked-out teammates.
- **Ask AI**: "Which sites are on Hostinger?", "What still needs Search Console?", or "Today's brief".

---

## Getting the apps (no coding)

The installers are built for you on GitHub's computers:

1. Create a free account at [github.com](https://github.com) and a **private** repository (for example `sitekeep`).
2. Upload this folder to it (or ask Claude to do it for you).
3. GitHub builds the apps automatically, in about 15–20 minutes. Open the repository's **Releases** page and download:
   - **SiteKeep-Windows-Setup.exe**: double-click to install. If Windows says "Windows protected your PC", click **More info → Run anyway** (the app isn't code-signed yet).
   - **SiteKeep-Android.apk**: open it on your phone and allow installing from that source.

Every time the project changes, a new release appears with fresh installers. On Android, if an update won't install over the old version, uninstall the old one first. Your data lives in Supabase, so nothing is lost.

---

## How your data is protected

- Everything (site details, passwords, tasks, settings, your AI key) is **encrypted on your device** before it goes to Supabase. Supabase only stores scrambled text.
- Your **master password never leaves your device**. The app turns it into a separate login key for Supabase plus an encryption key.
- Each site has its own key. Sharing a site gives the teammate's account a copy of that key, locked so only they can open it.
- Removing a teammate **re-locks the site with a new key**, so their old copy stops working. (They may remember passwords they saw, so change the important ones.)
- **The AI never sees passwords, usernames, login URLs or notes.** Notifications never include usernames or passwords either. Automated tests check both.
- The vault locks after 10 minutes idle (adjustable), and you unlock each time you open the app.

### Forgotten passwords and the admin panel

Because only you know your master password, **no admin (and not Supabase) can reset it and still read your data**. That's what keeps the vault safe. Instead:

- **Recovery key**: everyone gets one when they create their vault (and can make one in Settings). Forgot your password? Tap **Forgot your password?**, enter the code SiteKeep emails you, then your recovery key, and choose a new password. Nothing is lost.
- **No recovery key?** The person starts a fresh vault from the same email. Shared sites come back after a teammate who can edit those sites taps **Restore access** (on the Team page or the site's page). Restoring is a deliberate click on purpose: check with the person by phone or chat first, because someone who broke into their email could also start a fresh vault. Sites only they could open are lost.
- **Admin panel (Team page)**: the first person to create a vault is the admin. Admins invite people (only invited emails can join), see everyone and how many sites each has, make or remove admins, and remove someone from all their sites when they leave.

---

## 1. One-time setup: Supabase (free)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql`, click **Run**. (Already ran an older version? Just run the new one; it upgrades in place.)
3. **Authentication → Sign In / Providers → Email**: turn **off "Confirm email"** (simpler for a private team app).
4. **Authentication → Emails → Reset Password**: replace the message body with something that shows the code, for example:
   ```html
   <h2>Your SiteKeep code</h2>
   <p>Enter this code in SiteKeep to reset your password: <strong>{{ .Token }}</strong></p>
   ```
   This is what the "Forgot your password?" screen asks for.
5. **Project Settings → API**: copy the **Project URL** and the **anon** (or **publishable**) key. **Never** use the `service_role` key in the app.
6. Open SiteKeep, paste those two values, and **Create your vault**. You're the admin. Invite your team from the **Team** page.

You don't need to turn off sign-ups: people who weren't invited can't create a vault.

**Free-tier notes:** Supabase pauses free projects after about a week with no activity (click "Restore" in the dashboard; your data is kept). The built-in email sender is limited to a few emails per hour, which is plenty for occasional password resets.

## 2. Add your team

1. On the **Team** page, type a teammate's email and click **Invite**. A setup message (with the two Supabase values) is copied. Paste it to them in chat or email.
2. They install SiteKeep, paste the values, and create their vault with that email.
3. Open a site → **Who has access** → type their email → **Can edit** or **View only** → **Share**.

## 3. Reminders

On first unlock, Today shows **Get reminders on this device**. Tap **Turn on reminders** and allow notifications when your device asks. You can change it later in **Settings → Reminders on this device**, choose the daily reminder time, and hide task names if others can see your lock screen.

- **Android**: reminders are scheduled ahead and arrive even when SiteKeep is closed, including after a restart.
- **Windows**: reminders show while SiteKeep is open (Windows apps can't schedule them ahead in this version).

## 4. Connect Blackbox AI

Open **Settings**:

- **API base URL**: `https://api.blackbox.ai` (or `https://enterprise.blackbox.ai` for enterprise accounts)
- **API key**: from your Blackbox account settings
- **Model**: any chat model id from your Blackbox dashboard. The default is `blackboxai/openai/gpt-5.5`.

Click **Test connection**. Your key is saved encrypted with your vault and syncs to your other devices.

---

## For developers

### Try it without any setup
```bash
npm install
npm run demo
```
Opens the app at http://localhost:1420 with sample sites, tasks and teammates. Nothing is saved.

### Run and build on your own PC
Needs Node.js 20+, Rust, and on Windows the "Microsoft C++ Build Tools". Full list: https://v2.tauri.app/start/prerequisites/
```bash
npm install
npm run tauri dev       # run the desktop app
npm run tauri build     # Windows installer in src-tauri/target/release/bundle/
```

Android on your own PC needs Android Studio (SDK, NDK, JDK) with `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME` set ([guide](https://v2.tauri.app/start/prerequisites/#android)):
```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npx tauri android init
npx tauri android build --apk --debug
```
For the Play Store you'll need to sign the app: https://v2.tauri.app/distribute/sign/android/

Tip: to skip the "connect your sync database" screen for everyone, copy `.env.example` to `.env`, fill it in, and build.

### Project layout
```
supabase/schema.sql          Database tables + security rules (safe to re-run)
src/lib/crypto.ts            All encryption (libsodium: Argon2id, XSalsa20-Poly1305, sealed boxes) + recovery keys
src/lib/vault.ts             Login, recovery, sites, tasks, sharing, key rotation, admin
src/lib/notify.ts            Device reminders
src/lib/ai.ts                Blackbox calls + the "no secrets" filter
src/components/              Screens
src/demo/                    In-memory sample backend for `npm run demo`
src-tauri/                   Desktop/Android shell (Rust)
.github/workflows/build.yml  Builds Windows + Android and publishes a Release
```
Run the tests: `npm test`

### Notes and limits
- **Sign-up fails with a password-strength error:** keep Supabase's password rules at the defaults. The app sends Supabase a 64-character generated login key, not your real password, so rules like "must contain a symbol" can block it.
- **Self-hosted Supabase or a custom domain:** add your domain to `connect-src` in `src-tauri/tauri.conf.json`.
- **Deleting an account completely:** remove the person from your sites on the Team page, then delete them in Supabase under Authentication › Users.
- **Not built yet:** encrypted backup export, and importing logins from a CSV or browser export.
