# Building Ember installers

The **Build installers** GitHub Actions workflow compiles Windows x64 (NSIS), Linux x86_64 (RPM), Android ARM64 (APK), and the Cloudflare Pages web ZIP. Run it from the Actions tab and select all platforms or one platform. Results are downloadable workflow artifacts.

Windows FFmpeg and ffprobe are downloaded from the existing v1.0-deps release and verified with SHA-256. Existing local copies are verified too. The Linux media tools are included in the source. Android media tools are compiled with NDK 27.2.12479018.

The Android workflow artifact is **unsigned**. Sign it locally with the retained Ember keystore before distributing it. Keep the keystore and password out of the repository, workflow logs, and public artifacts. Reusing the original signing key preserves Android update compatibility.

Use Android SDK Build Tools to align the APK before signing:
```text
zipalign -P 16 -f 4 unsigned.apk aligned.apk
apksigner sign --ks /private/ember-release.jks --ks-key-alias ember --ks-pass file:/private/password.txt --out Ember-0.7.5-android-arm64.apk aligned.apk
apksigner verify --verbose --print-certs Ember-0.7.5-android-arm64.apk
```

The distribution filenames for 0.7.5 are:
- Ember-Setup-v0.7.5-x64.exe
- Ember-0.7.5-1.x86_64.rpm
- Ember-0.7.5-android-arm64.apk
- Ember-Web-0.7.5-Cloudflare-Pages.zip

Generate SHA256SUMS from the final distributable files after Android signing. Upload them to a draft GitHub release, then publish the complete set. The **Verify published installers** workflow downloads the release and compares every EXE, RPM, APK and ZIP against SHA256SUMS. It also checks RPM metadata. It can be run manually for an existing release.

Building and inspecting packages does not establish real-device playback correctness. Windows installers are not Authenticode-signed unless a separate Windows signing certificate is configured.
