# turbalance Analytics Mobile

This mobile package contains native iPhone and Android apps for turbalance
Analytics. Both render a mobile operator cockpit and refresh live telemetry from
the configured controller URL, falling back to a local sample when the private
feed is unavailable.

## Quick Start

```sh
cd mobile/capacitor
npm run build:ios:simulator
npm run open:ios
```

Open `ios/App/App.xcodeproj` in Xcode when you want to select a signing team,
run on a physical iPhone, or archive for TestFlight.

For Android:

```sh
cd mobile/capacitor
npm run build:android:debug
```

The debug APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected Android device with:

```sh
npm run android:install
```

This project uses Capacitor 8's Android libraries, which require JDK 21 for the
local Gradle build. On this Mac, Homebrew OpenJDK 21 is installed at:

```text
/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

## TestFlight Packaging

The iOS target is pinned to Apple team `TWFK4FAG36` and bundle identifier
`com.turbalance.analyticsApp`. Use the packaging helper so local archives and
uploads do not drift to another app identifier:

```sh
cd mobile/capacitor
npm run ios:check-signing
npm run ios:archive
npm run ios:testflight
```

`npm run ios:testflight` builds a fresh Release archive and uploads it to App
Store Connect for TestFlight. It requires either an App Store Connect-enabled
Apple account in Xcode, or an App Store Connect API key:

```sh
ASC_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8 \
ASC_KEY_ID=XXXXXXXXXX \
ASC_ISSUER_ID=00000000-0000-0000-0000-000000000000 \
npm run ios:testflight
```

For registered development devices only, export a development-signed IPA with:

```sh
npm run ios:export:development
```

The native iPhone and Android apps fetch live telemetry from:

```text
http://192.168.10.103:8000/build/demo/live-machine-bundle.json
```

Update `TelemetryModels.swift` and `android/app/src/main/java/com/turbalance/analytics/MainActivity.java`
if the dashboard host moves or if you switch to HTTPS.

## Notes

- The iOS app is SwiftUI and the Android app is a native Java activity. Neither
  mobile shell depends on rendering the desktop dashboard inside a WebView.
- The current endpoint is HTTP on a private network. For a production mobile app, use HTTPS.
- iOS includes a local-network usage string and App Transport Security exceptions
  for the current lab controllers (`100.95.183.13`, `192.168.10.30`, and `192.168.10.103`).
- Android enables cleartext HTTP for the same private-network controller and
  requests notification permission only when threshold alerts are enabled.
