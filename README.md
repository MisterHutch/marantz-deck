# Marantz Deck

An unofficial local digital remote for the **Marantz SR5010** on Omarchy. The bar widget opens a browser window with live power, volume, mute, input, and sound mode controls; receiver setup, including video pass-through; and a nine-band graphic EQ editor. It uses the receiver's HTTP status pages and Marantz's 2015 IP control protocol on TCP port 23. No cloud account or npm dependencies are needed.

## Install on Omarchy

Requires Omarchy Quattro, a Chromium-based browser, and Node.js 20 or newer available through `mise`. Install Node if needed with `mise use -g node@latest`.

```bash
omarchy plugin add https://github.com/MisterHutch/marantz-deck.git --enable
```

Click **M** in the Omarchy bar to open the remote. The plugin starts a localhost-only server on port 4174 while enabled. On first launch, enter the SR5010's IP address or hostname in **Settings**. Find it under **Setup → Network → Information** on the receiver. The address is saved in `~/.config/marantz-deck/config.json`, outside the plugin directory, so updates do not erase it.

The receiver needs **Setup → Network → Network Control → Always On** for control while in standby. That setting increases standby power usage.

## Update on Omarchy

Keep the plugin installed as a Git checkout using the install command above.
Omarchy's plugin managers can then discover updates from this repository. A
manually copied folder has no Git history and cannot use the normal updater.

Run this in a terminal to fetch available changes, review the diff, and choose
whether to apply them:

```bash
omarchy plugin update io.github.misterhutch.marantz-deck
```

Omarchy fast-forwards the checkout, validates the plugin manifest and entry
points, and reloads plugins when an update is applied. If validation fails, its
updater rolls the checkout back. Saved receiver settings remain in
`~/.config/marantz-deck/config.json`, outside the checkout.

For an unattended update after reviewing the source:

```bash
omarchy plugin update io.github.misterhutch.marantz-deck --yes
```

After an update, open **M** in the bar or verify the local web server:

```bash
curl --fail --silent --show-error http://127.0.0.1:4174/api/config
```

This checks the local server; it does not prove a connection to the receiver.
The updater validates the plugin structure, while `npm test` in the checkout
runs the application's command-mapping and parsing tests without contacting the
receiver. Keep source edits in a development checkout so local changes do not
interfere with updates to the installed plugin.

## Use without the Omarchy widget

```bash
node server.js
```

Open <http://127.0.0.1:4173>. The `MARANTZ_HOST` environment variable can override the saved address for a session. `PORT` can change the local port. The server always binds to `127.0.0.1`.

Keyboard shortcuts: arrow keys change volume; **M** toggles mute.

## Video output and TV overscan

The **Setup** tab includes a **Video Output** card for the receiver's
**Setup → Video → Output Settings**:

| Setting | Options | Use it for |
|---|---|---|
| **i/p Scaler** | Off (pass-through), HDMI | **Off** sends the source's HDMI video to the TV untouched. The SR5010 has no "Through" resolution option; turning the scaler off is its pass-through. |
| **Video Mode** | Auto, Game, Movie | **Game** lowers processing latency for a PC or console. |
| **Video Conversion** | On, Off | Converting analog sources for HDMI output. |

Each change is read back from the receiver to confirm it. The TV re-syncs its
HDMI signal when these change, so the screen may go dark for a few seconds.
With the scaler off, the receiver no longer offers its resolution, progressive
mode, or aspect ratio settings; they only apply while it is scaling.

**Edge of the screen cut off?** If the top of the Omarchy bar or the screen
edges are cropped on a TV, the cause is almost always the TV's overscan, not
the receiver. Turn on pass-through here, then turn off overscan on the TV:

- **LG** (webOS, e.g. CX/C1): **Settings → All Settings → Picture → Aspect
  Ratio Settings**, set **Aspect Ratio** to **Original** and **Just Scan** to
  **On**. If Just Scan is greyed out, open the **Home Dashboard**, edit the
  HDMI input, and set its icon to **PC**. That also enables full 4:4:4 color
  for sharper text.
- **Other TVs** use different names for the same setting: look for **Screen
  Fit** or **Fit to Screen** (Samsung), **Full Pixel** (Sony), **Dot by Dot**
  (Sharp), or an **Overscan** option set to Off.

## EQ and receiver limits

The Equalizer tab edits the receiver's nine-band **All speakers** curve (63 Hz through 16 kHz, −20 to +6 dB). It provides flat preview, revert, and explicit apply, then reads the curve back. To edit, select **All** speakers in the receiver EQ editor, set **MultEQ XT** to **Off**, and use a sound mode other than Direct or Pure Direct. Turning MultEQ XT off changes the active processing; the app does not change it automatically.

Controls and setup mappings were verified against the SR5010. Other Marantz models may use different commands or EQ pages and are not supported by this release.

## Remove

```bash
omarchy plugin remove io.github.misterhutch.marantz-deck
```

Disabling or removing the widget stops the server it owns. To remove the saved receiver address too, delete `~/.config/marantz-deck/config.json`.

## Development

```bash
npm test
omarchy plugin validate .
```

The source has no third-party runtime packages. License: MIT.
