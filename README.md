# Marantz Deck

An unofficial local digital remote for the **Marantz SR5010** on Omarchy. The bar widget opens a browser window with live power, volume, mute, input, and sound mode controls; receiver setup; and a nine-band graphic EQ editor. It uses the receiver's HTTP status pages and Marantz's 2015 IP control protocol on TCP port 23. No cloud account or npm dependencies are needed.

## Install on Omarchy

Requires Omarchy Quattro, a Chromium-based browser, and Node.js 20 or newer available through `mise`. Install Node if needed with `mise use -g node@latest`.

```bash
omarchy plugin add https://github.com/MisterHutch/marantz-deck.git --enable
```

Click **M** in the Omarchy bar to open the remote. The plugin starts a localhost-only server on port 4174 while enabled. On first launch, enter the SR5010's IP address or hostname in **Settings**. Find it under **Setup → Network → Information** on the receiver. The address is saved in `~/.config/marantz-deck/config.json`, outside the plugin directory, so updates do not erase it.

The receiver needs **Setup → Network → Network Control → Always On** for control while in standby. That setting increases standby power usage.

## Use without the Omarchy widget

```bash
node server.js
```

Open <http://127.0.0.1:4173>. The `MARANTZ_HOST` environment variable can override the saved address for a session. `PORT` can change the local port. The server always binds to `127.0.0.1`.

Keyboard shortcuts: arrow keys change volume; **M** toggles mute.

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
