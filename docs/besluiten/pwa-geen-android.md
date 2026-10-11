# PWA, geen Android-app (2026-10-11, gebruiker)

De app leest alleen een JSON van de pc; geen sensoren, meldingen of offline spel. Jumbo/Plus blokkeren directe toegang
vanaf een telefoon, dus de pc-verzamelaar blijft de bron. Patroon: `growatt` (`serve.mjs` + `pagina.html` + `pwa/`).
Poort 8092, tailscale https :8445, nooit `funnel`. Afgewezen: pure-Kotlin app zoals de zusterapps (bouw- en installatiewerk
zonder meerwaarde).
