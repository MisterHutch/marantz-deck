import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui

BarWidget {
  id: root
  moduleName: "io.github.misterhutch.marantz-deck"

  readonly property bool opened: false
  readonly property string pluginDir: decodeURIComponent(String(Qt.resolvedUrl(".")).replace(/^file:\/\//, "")).replace(/\/+$/, "")
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function open() {
    Quickshell.execDetached(["bash", root.pluginDir + "/launch.sh"])
  }

  function close() {}

  IpcHandler {
    target: root.moduleName
    function launch(): string { root.open(); return "ok" }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "M"
    tooltipText: "Open Marantz Deck"
    onPressed: function(buttonCode) { if (buttonCode === Qt.LeftButton) root.open() }
  }
}
