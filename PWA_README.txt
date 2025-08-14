Tacho‑Dziennik PWA quick files

Upload these to your repo (root):
- manifest.webmanifest
- sw.js
- /icons/icon-192.png
- /icons/icon-512.png

Then in your index.html add in <head>:
<link rel="manifest" href="./manifest.webmanifest">
<meta name="theme-color" content="#111318">
<link rel="apple-touch-icon" href="./icons/icon-192.png">

And near the bottom (before </body>), register service worker:
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js');
    });
  }
</script>

GitHub Pages: Settings → Pages → Deploy from a branch → main / (root).
Open https://<user>.github.io/<repo>/ in Safari (HTTPS).
