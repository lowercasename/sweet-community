// Light or dark colours (architecture.md, Interface). The page loads this script in its head, before anything is
// drawn, so the colours never flash. It sets data-theme on the html element to "light" or "dark". The choice is kept
// on this device in localStorage under sweet.theme: "light", "dark", or nothing to match the device's setting. The
// Settings page reads and changes the choice through window.sweetTheme.
;(function () {
  var KEY = 'sweet.theme'
  var media = window.matchMedia('(prefers-color-scheme: dark)')
  function get() {
    try {
      var v = localStorage.getItem(KEY)
      return v === 'light' || v === 'dark' ? v : 'device'
    } catch (e) {
      return 'device'
    }
  }
  function apply() {
    var choice = get()
    var dark = choice === 'dark' || (choice === 'device' && media.matches)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }
  function set(choice) {
    try {
      if (choice === 'light' || choice === 'dark') localStorage.setItem(KEY, choice)
      else localStorage.removeItem(KEY)
    } catch (e) {
      // Storage can be unavailable, for example in a private window. The choice then lasts until the page closes.
    }
    apply()
  }
  apply()
  // The device's setting can change while the page is open, and another tab can change the choice.
  media.addEventListener('change', apply)
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply()
  })
  window.sweetTheme = { get: get, set: set }
})()
