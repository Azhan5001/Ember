# Ember 0.7.6

This update repairs silent playback, profile isolation and an Android startup crash.

- The player detects video progressing without decoded audio and opens compatibility playback. Matroska sources on the website use browser remuxing and audio conversion when required; providers that forbid browser fetching can still use native playback when compatible.
- Right-clicking the player offers one Download video action. A browser download fallback invites the user to click the download link.
- Progress writes are scoped to the account and subprofile. Late playback callbacks cannot update another profile. Explicit history deletion removes its progress data and syncs tombstones. Legacy unscoped records cannot overwrite the selected subprofile.
- Android creates its private encryption key using an atomic rename under a database lock. Its SELinux policy forbids the hard-link operation used by 0.7.5, which caused startup to abort.

Run `supabase/ember-privacy-076.sql` in Supabase SQL Editor after updating clients. It purges deleted payloads, retires legacy unscoped records for migrated accounts, preserves scoped history and progress, and reports matching entries across profiles for review. It does not guess which profile owns previously mixed records. Remove unwanted entries in the updated app.

Browser playback still depends on the provider permitting range requests and on the device supporting the video codec. Desktop compatibility playback can convert video as well as audio. Source availability can vary independently of Ember.

Validation includes profile/deletion and database migration tests, browser playback with AAC and DTS fixtures, the one-item context menu, Windows storage regression tests, and Android first-launch/restart checks. Device-specific testing on the reported Poco X7 Pro remains necessary.
