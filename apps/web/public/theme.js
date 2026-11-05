// External file so the Content Security Policy can forbid inline scripts.
// Runs before first paint to avoid a flash of the wrong theme.
try {
  var t = localStorage.getItem("lifeos.theme");
  var dark =
    t === "dark" || ((!t || t === "system") && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
} catch {
  // Storage can be unavailable in private windows. The default theme applies.
}
