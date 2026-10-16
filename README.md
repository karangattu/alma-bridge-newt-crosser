# Newt Crosser

Help the newts safely cross Alma Bridge Road!

## How to Play

- Objective: Get the newt from the bottom to the top without getting hit.
- Controls:
  - Keyboard: Arrow keys to move. P to pause/resume. Enter selects Play Again after Game Over.
  - Mobile: Swipe to move, or tap the on‑screen arrow buttons. Tap ▶ in the top‑left to pause/resume.
  - Game Over: Choose Play Again for a fresh run or Home to return to the start screen.

## Scoring and Lives

- You start with 3 lives. Collisions cost 1 life.
- Each successful crossing adds +1 to your score.
- Your best run is saved as High Score in your browser.

## Tips

- Watch traffic direction and speed; trucks are slower but longer, motorcycles are quick.
- You can pause anytime to take a breather.

## Run locally

Just open `index.html` in a modern browser. If the canvas doesn’t size correctly, try resizing the window.

## Android tablet APK

The Android app supports Android 7.0 and later. It bundles the game, sprites,
intro video, Phaser, and Inter fonts. It works from its first launch without
Wi-Fi or mobile data and does not request internet access. Scores and tutorial
progress stay on the device. The website continues to use its online leaderboard;
the APK has a separate leaderboard for players on that tablet.

### Tagged releases

`.github/workflows/android-release.yml` runs when a tag is pushed or a GitHub
release is published. It tests the game and offline bundle, builds a signed
release APK, runs Android lint, verifies the signature, and uploads
`newt-crosser-android.apk` and its SHA-256 checksum to that tag's GitHub release.
If the release does not exist, the workflow creates it. Tags containing `-` are
marked as prereleases when creating a release.

After the Android support is merged, publish a release with:

```sh
git tag v1.0.0
git push origin v1.0.0
```

You can also run **Actions → Android APK release → Run workflow** with an
existing tag to rebuild it. The tag must contain the Android project. Each
workflow run uses an increasing Android version code so newer APKs can update
older installations. Keep the workflow's run history and signing key stable.

The workflow requires these repository Actions secrets:

- `ANDROID_KEYSTORE_BASE64`: the base64-encoded PKCS12 signing keystore.
- `ANDROID_KEYSTORE_PASSWORD`: its password.
- `ANDROID_KEY_ALIAS`: the signing key's alias.
- `ANDROID_KEY_PASSWORD`: the key's password.

Keep a secure backup of the keystore and its credentials outside Git. Use the
same key for every release; a different key cannot update an installed APK.

### Install or update on a tablet

1. Download `newt-crosser-android.apk` from the GitHub release's **Assets**.
2. Open the APK on the tablet and allow installation from that browser or file
   manager when Android asks.
3. Install and open **Newt Crosser**, then hold the tablet sideways to play.

To update, install a newer APK over the existing app. This keeps local scores.
Uninstalling the app or clearing its storage removes those scores.

### Build and test locally

Install Node.js 22, JDK 17, and Android SDK platform 36 and build tools 36.0.0.
Set `ANDROID_HOME` to the SDK directory and `JAVA_HOME` to JDK 17, then run:

```sh
npm ci
npx playwright install chromium
npm run test:e2e
cd android
./gradlew assembleDebug lintDebug
```

The test suite builds the offline web bundle and verifies that it loads without
external requests and keeps each player's highest score after reopening. Gradle
also rebuilds that bundle automatically. The debug APK is at
`android/app/build/outputs/apk/debug/app-debug.apk`; it uses a development key
and cannot update an installation signed with the release key.

For a signed release build, set `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Optionally set `ANDROID_VERSION_CODE` (a positive integer) and
`ANDROID_VERSION_NAME` (the release tag), then run:

```sh
./gradlew assembleRelease lintRelease
```

The signed APK is at `android/app/build/outputs/apk/release/app-release.apk`.
The build refuses to produce a release APK without the signing credentials.

The APK uses `assets/intro_video_android.mp4`, an H.264 Baseline copy of the
website's intro that works with Android's video decoder. If you replace the
original intro, regenerate this copy with FFmpeg:

```sh
ffmpeg -i assets/intro_video.mp4 -an -c:v libx264 -profile:v baseline -level 3.1 \
  -pix_fmt yuv420p -r 30 -crf 24 -movflags +faststart assets/intro_video_android.mp4
```

## About

To learn more about the plight of the newts crossing Alma Bridge Road, visit [bioblitz.club/newts](http://bioblitz.club/newts).
