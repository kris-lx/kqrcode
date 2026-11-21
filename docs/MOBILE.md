# iOS and Android

k-qr-scanner runs wherever a web view can open the camera. This page lists the setup for each way of shipping it on phones.

| you ship | setup | guide |
| :--- | :--- | :--- |
| a website or PWA | HTTPS, nothing else | [browsers and PWAs](#browsers-and-pwas) |
| a React Native or Expo app | `npx k-qr-scanner init` | [REACT_NATIVE.md](REACT_NATIVE.md) |
| a Capacitor (Ionic) app | `npx k-qr-scanner init`, then `npx cap sync` | [Capacitor](#capacitor) |
| your own iOS app with a `WKWebView` | `Info.plist` entry and 3 web view settings | [native iOS](#native-ios-wkwebview) |
| your own Android app with a `WebView` | manifest entry and a `WebChromeClient` | [native Android](#native-android-webview) |
| a Flutter app | `flutter_inappwebview` with a permission callback | [Flutter](#flutter) |

Every case needs the same three things:

1. **A camera permission entry** in the app: `NSCameraUsageDescription` on iOS and `android.permission.CAMERA` on Android. Without the iOS entry, iOS ends the app as soon as the camera opens.
2. **A secure page**: `https://`, `localhost`, or a page the web view treats as secure. Browsers refuse the camera on plain `http://`.
3. **Inline video**: the web view must play the camera inside the page, not in a full-screen player.

| | minimum |
| :--- | :--- |
| iOS | Safari 15.4; app web views (`WKWebView`) 14.5 |
| Android | 7, with an up-to-date Android System WebView or Chrome |

## Browsers and PWAs

Nothing to configure beyond HTTPS. Safari on iOS and Chrome on Android ask for the camera once per site. The scanner also works in a PWA added to the home screen.

- **iOS** has no camera zoom API, so the scanner asks for a 4K stream and zooms digitally. The flashlight works where Safari exposes it.
- **Android** gets hardware zoom and the flashlight on most phones.
- **In-app browsers** (social and chat apps) sometimes block the camera. If `onError` reports `permission-denied` or `unsupported` there, offer a link that opens the page in Safari or Chrome.

## Capacitor

```bash
npx k-qr-scanner init     # detects Capacitor and adds both camera permissions
npx cap sync
```

`init` writes the entries into `ios/App/App/Info.plist` and `android/app/src/main/AndroidManifest.xml`. If the native projects don't exist yet, run `npx cap add ios` and `npx cap add android` first, then `init` again. `npx k-qr-scanner doctor` checks both entries.

Use the scanner as in any web app ([FRAMEWORKS.md](FRAMEWORKS.md)). Capacitor's Android web view asks the user for the camera permission when the scanner starts. On iOS the system asks once, the first time the camera opens.

## Native iOS (WKWebView)

`Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>Scan QR codes</string>
```

The web view:

```swift
import WebKit

final class ScannerViewController: UIViewController, WKUIDelegate {
  override func viewDidLoad() {
    super.viewDidLoad()
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true             // camera inside the page
    config.mediaTypesRequiringUserActionForPlayback = []
    let web = WKWebView(frame: view.bounds, configuration: config)
    web.uiDelegate = self
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(web)
    web.load(URLRequest(url: URL(string: "https://your.site/scan")!))
  }

  // iOS 15+: grant the page's camera request, so the user isn't asked a second time
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin,
               initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType,
               decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    decisionHandler(origin.host == "your.site" ? .grant : .prompt)
  }
}
```

To ship the page inside the app instead, load it with `loadHTMLString(html, baseURL: URL(string: "https://your.site/"))`: an `https` base URL makes it a secure page.

## Native Android (WebView)

`AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
```

The web view:

```kotlin
class ScannerActivity : AppCompatActivity() {
  private lateinit var web: WebView
  private var pendingRequest: PermissionRequest? = null
  private var filePicked: ValueCallback<Array<Uri>>? = null

  private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    pendingRequest?.let { if (granted) it.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else it.deny() }
    pendingRequest = null
  }
  private val pickImage = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
    filePicked?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
    filePicked = null
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    web = WebView(this)
    setContentView(web)
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.settings.mediaPlaybackRequiresUserGesture = false   // camera inside the page
    web.webChromeClient = object : WebChromeClient() {
      // the page asks for the camera: check the app permission first, then grant
      override fun onPermissionRequest(request: PermissionRequest) {
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE !in request.resources) return request.deny()
        if (ContextCompat.checkSelfPermission(this@ScannerActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
          request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else {
          pendingRequest = request
          askCamera.launch(Manifest.permission.CAMERA)
        }
      }
      // album import (<input type="file">)
      override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
        filePicked = callback
        pickImage.launch(params.createIntent())
        return true
      }
    }
    web.loadUrl("https://your.site/scan")
  }

  override fun onPause() { super.onPause(); web.onPause() }     // release the camera in the background
  override fun onResume() { super.onResume(); web.onResume() }
}
```

To ship the page inside the app, serve it from `https://appassets.androidplatform.net/` with `WebViewAssetLoader` (AndroidX WebKit), which counts as a secure page.

## Flutter

[`flutter_inappwebview`](https://pub.dev/packages/flutter_inappwebview) supports the camera on both platforms:

```dart
InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri('https://your.site/scan')),
  initialSettings: InAppWebViewSettings(
    mediaPlaybackRequiresUserGesture: false,   // camera inside the page
    allowsInlineMediaPlayback: true,           // iOS
  ),
  onPermissionRequest: (controller, request) async => PermissionResponse(
    resources: request.resources,
    action: PermissionResponseAction.GRANT,
  ),
)
```

Add the two permission entries to `ios/Runner/Info.plist` and `android/app/src/main/AndroidManifest.xml`, and request the Android runtime permission (for example with [`permission_handler`](https://pub.dev/packages/permission_handler)) before opening the page.

## Checklist

| check | iOS | Android |
| :--- | :--- | :--- |
| permission entry | `NSCameraUsageDescription` | `android.permission.CAMERA` |
| runtime permission | asked by the system | ask before the page needs it (React Native and Capacitor do it for you) |
| secure page | `https://` or an `https` base URL | `https://` or `WebViewAssetLoader` |
| inline video | `allowsInlineMediaPlayback` | `mediaPlaybackRequiresUserGesture = false` |
| grant the page's request | `requestMediaCapturePermissionFor` (iOS 15+) | `onPermissionRequest` |
| album import | works by default | `onShowFileChooser` |
| background | the scanner pauses by itself | call `web.onPause()` / `onResume()` |

`npx k-qr-scanner doctor` checks the permission entries in React Native, Expo and Capacitor projects.
