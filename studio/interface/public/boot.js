// Applies the saved display settings to <html> before first paint (blocking script in <head>).
// Mirrors parseSettings/settingsAttributes in lib.js; test/lib.test.mjs keeps the two in step.
(function () {
  var font = "medium";
  var width = "normal";
  var density = "compacta";
  var motion = "normal";
  try {
    var stored = JSON.parse(localStorage.getItem("pi-studio:settings"));
    if (stored && typeof stored === "object") {
      if (["small", "medium", "large"].indexOf(stored.fontSize) !== -1) font = stored.fontSize;
      if (["normal", "wide"].indexOf(stored.chatWidth) !== -1) width = stored.chatWidth;
      if (["confortavel", "compacta", "maxima"].indexOf(stored.density) !== -1) density = stored.density;
      if (stored.reduceMotion === true) motion = "reduce";
    }
  } catch (error) {
    // No storage or corrupt JSON: defaults.
  }
  var root = document.documentElement;
  root.dataset.font = font;
  root.dataset.width = width;
  root.dataset.density = density;
  root.dataset.motion = motion;
  // Theme: "light" or "dark" chosen in the top bar; nothing stored (or anything else) follows the system.
  try {
    var theme = localStorage.getItem("pi-studio:theme");
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
  } catch (error) {
    // No storage: follow the system.
  }
})();
