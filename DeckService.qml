import QtQuick
import Quickshell.Io

Item {
  id: root
  readonly property string pluginDir: decodeURIComponent(String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "")).replace(/\/+$/, "")

  Process {
    command: ["/usr/bin/env", "PORT=4174", "/usr/bin/mise", "exec", "--", "node", root.pluginDir + "/server.js"]
    running: true
    onExited: function(code) { console.warn("Marantz Deck server exited (" + code + "); check Node.js and port 4174") }
  }
}
