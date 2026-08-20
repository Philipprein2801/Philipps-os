# Testbericht – Philipp OS Mobile

Getestet am 20.08.2026 mit Chromium in einer mobilen 390×844-Viewport-Simulation.

## Ergebnis

**27/27 automatisierte Funktionstests bestanden.**

Geprüft wurden unter anderem:

- App startet ohne JavaScript-Fehler
- kein horizontaler Overflow auf dem getesteten Mobile-Viewport
- mobile Bottom-Navigation vorhanden
- Morgen-Check-in speichern
- Abend-Check-in speichern
- Protein live addieren und Tagesziel auswerten
- Wasser aus kleinen/großen Gläsern berechnen
- 3×-Gym-Wochenziel zählen
- Home-Training separat als Bonus behandeln
- Fokus- und Zukunftsblöcke berechnen
- Schlafdauer über Mitternacht berechnen
- Tagesgefühl auswerten
- Datenpersistenz über LocalStorage
- veränderbare Glasgrößen werden sofort übernommen
- Backup-Export als gültiges JSON
- Import des vorhandenen Philipp-OS-Version-4-Backups
- Migration von altem Oberkörper-/Unterkörpertraining zu „Gym“
- keine erfundene Umrechnung alter Protein-/Wasser-Stufen in Gramm/Liter
- PWA-Manifest syntaktisch gültig
- Service-Worker-Datei vorhanden

Zusätzlich wurden `app.js` per Node-Syntaxcheck und `manifest.webmanifest` per JSON-Parser validiert.

Hinweis: Die Testumgebung blockiert lokale HTTP-Navigation. Deshalb wurden die produktiven HTML-/CSS-/JS-Dateien für die Interaktionstests unverändert in eine Chromium-Testseite injiziert. PWA-Dateien wurden zusätzlich statisch validiert. Auf GitHub Pages laufen sie über HTTPS, wodurch der Service Worker regulär registriert werden kann.
