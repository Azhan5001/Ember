# Connect your Ember Supabase project

The v0.4.0 installer already contains your project URL and public publishable key. You do not need to enter database details on each device. No administrator credentials or passwords are embedded. For a new project run ember-supabase-setup.sql. For an existing v0.3 project run ember-multi-profile-migration.sql. Both are safe to rerun and leave older watch_progress tables untouched.

## 1. Create the tables and sync function

1. Open your Supabase project dashboard.
2. Select SQL Editor → New query.
3. Open ember-supabase-setup.sql for a new project, or ember-multi-profile-migration.sql for an existing project, in a text editor, copy the entire file, paste it into the SQL editor and click Run.
4. Wait for success. If an error occurs, copy the error text; do not disable security policies.
5. In Table Editor you should see ember_sync_heads and ember_sync_records. Both have row-level security enabled. They intentionally deny direct client writes; the ownership-checked ember_sync_v1 function is the supported interface.

No users need to be added manually. Supabase Auth creates them when they register through Ember. Do not put passwords in these tables. The publishable key alone cannot apply this migration, configure email delivery or read user records.

## 2. Enable email/password registration

Go to Authentication → Sign In / Providers. Enable Email and Allow new users to sign up. Keep Confirm email enabled. Leave anonymous sign-ins disabled.

## 3. Configure email delivery

Go to Authentication → Email / SMTP Settings (dashboard labels can vary) and enable custom SMTP. Use an SMTP service or mailbox that permits authenticated SMTP. Enter its sender email/name, host, port, username and SMTP password directly in Supabase. Do not paste those credentials into chat or into Ember. Sender domains/addresses must be verified as required by your provider. SMTP delivery can have its own costs/limits; the Supabase default sender is restricted and will not serve arbitrary friends' email addresses.

If you do not have an SMTP provider yet, the database and local app can be installed now, but normal confirmed registration/password recovery is not ready until email is configured. Do not add friends as dashboard team members to bypass email restrictions.

## 4. Use codes for desktop confirmation and recovery

In Authentication → Email Templates, set the Confirm signup template body to:

    <h2>Confirm your Ember account</h2>
    <p>Enter this code in Ember:</p>
    <p><strong>{{ .Token }}</strong></p>
    <p>If you did not request this, ignore the email.</p>

Set the Reset password template body to:

    <h2>Reset your Ember password</h2>
    <p>Enter this recovery code in Ember:</p>
    <p><strong>{{ .Token }}</strong></p>
    <p>If you did not request this, ignore the email.</p>

Save both templates. Custom SMTP is required for unrestricted email delivery and may be required to edit templates on free projects. Code entry avoids needing a hosted callback website or a localhost page. Leave URL redirect settings at their defaults for this code flow; no new callback/deep link needs whitelisting. Never use public share links containing authentication tokens.

## 5. Install and register

1. Close Ember and install v0.4.0 over your existing installation. Export a local backup before upgrading.
2. Open Settings → Your Ember account.
3. Enter your email and a password of at least 8 characters, then Create account.
4. Expand Confirm email or reset password. Enter the same email and the code from the confirmation email. Leave Password recovery code unchecked. Select Verify email code.
5. If not already signed in, sign in normally. The guest profile stays local. An account starts with a separate default profile; you can add more profiles and optionally isolate addons. Existing v0.3 account data becomes the main account profile.
6. Wait for Up to date. On another device install the same build and sign in with the same account; it downloads your settings, addons, library and watch progress.

Addons can contain your TorBox/debrid tokens. Only sign into your account on trusted devices. SQL access controls isolate each user, but this is not end-to-end encryption: the project administrator can access project data. Sign out switches to the local guest profile. The account's cached profiles remain separately available after signing back in. A four-digit profile PIN is a privacy gate, not a replacement for OS or account security.

## 6. Test the connection

Change Display name, then Sync now. The space:<profile-id>:profile:name record in ember_sync_records should change. No unchanged settings/history need to upload. Change another setting with network unavailable; Ember retains it and retries after connection returns. The first retry starts at about one minute, then backs off up to an hour; Sync now retries immediately. A restart retains the queue. Automatic checks run every ten seconds while open, and ordinary server calls occur only for pending edits, first login, retries or due reconciliation.

Daily is the default remote reconciliation interval; Weekly and Manually are available. Local edits still upload automatically, regardless of the remote reconciliation schedule. Timers only run while Ember is open. When no edits exist, the daily/weekly request downloads only records since the last cursor. After a long closed period, a due reconciliation runs at next launch. Supabase token refreshes can make additional authentication requests; sync is not literally the only backend traffic.

If two devices edit the same record before exchanging updates, Ember preserves the local edit and shows a conflict. Use cloud versions explicitly discards the local conflicting edit; Keep this device's versions resubmits it against the latest cloud revision. Deletions use tombstones so another device does not resurrect removed records. Account switches retain separate cached profiles and queues. Guest data is never uploaded. Disable the account sync switch to keep edits local on this device.

## 7. Recover a password

Open Settings, choose Forgot password, enter your email, and select Send recovery code. Enter the emailed code and select Verify email code. Enter a new password and select Set new password. The code is one-time and subject to Supabase expiry/rate limits.

## Troubleshooting

- Database setup required: run the full SQL file in this project. Do not use the old progress-only schema from earlier Ember releases.
- Cloud unavailable: local data stays usable. Check the project status and network; paused projects must be resumed manually in Supabase Dashboard. A normal app request does not automatically unpause the project.
- No confirmation/reset email: check custom SMTP, verified sender, spam folder, mail logs and rate limits. A public API key cannot fix email delivery.
- No such account or invalid password: use a separate Ember account, not your Supabase dashboard login.
- Conflicts: resolve from Settings before expecting those records to upload.
- Large addon record: individual sync records are limited to 128 KiB and a request to about 2 MB. Very large provider manifests may need a later manifest-compaction change. Local use is retained if upload is rejected.
- Devices see an older profile: use Sync now to fetch immediately instead of waiting for the chosen reconciliation schedule.

This release was tested against a local PostgreSQL-compatible engine plus mocked Supabase Auth HTTP responses. Your live project cannot be fully validated until you run the SQL and configure mail. No real accounts or emails were created by the build process.

