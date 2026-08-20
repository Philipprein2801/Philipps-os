# Philipp OS – Mobile

Mobile-first, statische GitHub-Pages-App. Keine Datenbank und kein Build-Schritt nötig.

## Auf GitHub Pages veröffentlichen

1. Neues GitHub-Repository erstellen, z. B. `philipp-os`.
2. Den **Inhalt dieses Ordners** in die oberste Ebene des Repositories hochladen (`index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, `assets/`).
3. In GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Branch `main` und Ordner `/ (root)` auswählen und speichern.
5. Die von GitHub angezeigte Pages-Adresse in Safari auf dem iPhone öffnen.
6. Optional: Safari → Teilen → **Zum Home-Bildschirm**.

## Daten

- Journal-Daten liegen in `localStorage` des Browsers, nicht im Repository.
- Unter **Ziele → Daten** können Backups exportiert/importiert werden.
- Der Import versteht auch das ältere Philipp-OS-Backup (Version 4). Alte abstrakte Protein-/Wasser-Stufen werden nicht in Gramm oder Liter umgerechnet, weil diese Information im alten Export nicht eindeutig enthalten ist.

## Standardziele

- 3× Gym pro Woche
- 1× Home als Bonus
- 170 g Protein pro Tag
- 3,0 L Wasser pro Tag
- 5 Fokusblöcke pro Woche à 60 Minuten
- 3 Zukunftsblöcke pro Woche à 45 Minuten
- 7:30 h Schlafziel
- kleines Glas 250 ml, großes Glas 500 ml

Alle Werte sind in der App unter **Ziele** änderbar.
