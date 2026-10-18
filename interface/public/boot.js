// Applies the saved display settings to <html> before first paint (blocking script in <head>).
// Mirrors parseSettings/settingsAttributes in lib.js; test/lib.test.mjs keeps the two in step.
(function () {
  var font = "medium";
  var width = "normal";
  var motion = "normal";
  try {
    var stored = JSON.parse(localStorage.getItem("pi-studio:settings"));
    if (stored && typeof stored === "object") {
      if (["small", "medium", "large"].indexOf(stored.fontSize) !== -1) font = stored.fontSize;
      if (["normal", "wide"].indexOf(stored.chatWidth) !== -1) width = stored.chatWidth;
      if (stored.reduceMotion === true) motion = "reduce";
    }
  } catch (error) {
    // No storage or corrupt JSON: defaults.
  }
  var root = document.documentElement;
  root.dataset.font = font;
  root.dataset.width = width;
  root.dataset.motion = motion;
})();
