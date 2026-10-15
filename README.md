# Livery Garage

Ein Browser-Editor für eigene Lackierungen (Liveries) in [over the hill](https://store.steampowered.com/app/2929250/).
Fan-Projekt, nicht von Funselektor.

Du malst auf den offiziellen Vorlagen, legst Logos, Text und Formen darauf und bekommst am Ende genau das, was der [offizielle Livery-Guide](https://mod.io/g/over-the-hill/r/official-livery-modding-guide) verlangt: `manifest.json`, Textur (2048 × 2048) und Icon (512 × 512).

## Was der Editor kann

- Das offizielle Vorlagen-Paket (Zip mit 21 PSDs) direkt im Browser einlesen, ohne Photoshop.
- Lack pro Zone wählen: Karosserie, Zweitfarbe oder Dach, mit den Werksfarben oder einer eigenen Farbe, dazu die Felgen-Varianten.
- Ebenen hinzufügen: Sponsor-Logos aus dem Paket, eigene Bilder, Text in acht Schriften, Streifen, Rechtecke und Kreise.
- Ebenen auf den sichtbaren Lack zuschneiden, damit Fenster, Lichter und Anbauteile frei bleiben.
- Rückgängig und Wiederholen, automatisches Speichern pro Auto, Designs als Datei mit Freunden teilen.
- Export als fertiges Zip für mod.io.
- Direkt in den Ordner `LocalLiveries` des Spiels schreiben, auf Wunsch live nach jeder Änderung.

## Starten

Voraussetzung ist Node.js 22.18 oder neuer.

```bash
npm install
```

```bash
npm run dev
```

Danach `http://localhost:5173` öffnen.
Beim ersten Start fragt der Editor nach dem Vorlagen-Paket.
Den Download-Link gibt es im offiziellen Guide, das Zip bleibt danach im Browser gespeichert.

Für das direkte Senden ins Spiel braucht es Chrome oder Edge auf dem Rechner, auf dem over the hill läuft (Windows).
Andere Browser können nur das Zip exportieren.

## Vom Editor ins Spiel

### Zum Ausprobieren, nur für dich

1. Im Editor auf „Ins Spiel senden“ klicken und den Ordner `C:\Users\<Name>\Documents\My Games\over the hill\LocalLiveries` wählen.
2. Im Spiel in der Garage den Tab „Livery Mods“ öffnen und einmal „Show local mods“ drücken.
3. Nach jeder Änderung im Editor im Spiel „Refresh local mods“ drücken.

Mit dem Schalter „Live“ schreibt der Editor nach jeder Änderung selbst in den Ordner.
Lokale Lackierungen sieht nur der eigene Rechner, im Multiplayer sehen die anderen sie nicht.

### Für den Multiplayer

1. „Als Mod exportieren“ wählen und das Zip herunterladen.
2. Auf [mod.io](https://mod.io/g/over-the-hill) „Add mod“ wählen, Titel, Beschreibung und Vorschaubild eintragen.
3. Das Zip als Mod-Datei hochladen und den Fahrzeug-Tag setzen, den der Export-Dialog anzeigt (zum Beispiel „Grand Woodman“).
4. Im Spiel abonnieren und in der Garage auswählen.

Wer mit einer mod.io-Lackierung fährt, dessen Mitspieler laden die Mod laut Guide automatisch und sehen sie.
Ob das auch mit versteckten (nicht öffentlichen) Mods klappt, ist noch nicht getestet.

## Vorlagen und Lizenz

Die Vorlagen und Sponsor-Logos gehören Funselektor und dürfen nur für over the hill Mods genutzt werden.
Sie dürfen nicht als Dateien weitergegeben werden.
Deshalb liefert der Editor keine Vorlagen mit, jede Person lädt ihr eigenes Paket.
Die `.gitignore` hält Zips und PSDs aus dem Repository heraus.

## Entwicklung

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Dev-Server mit Hot Reload |
| `npm run build` | Typecheck und Produktions-Build nach `dist/` |
| `npm test` | Unit-Tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript ohne Build |
| `npm run inspect-templates` | Analysiert alle PSDs im Paket und meldet Ebenen, die der Editor nicht versteht |

Im Dev-Modus lädt der Startbildschirm das Paket auf Knopfdruck aus dem Projektordner.

`npm run inspect-templates` nach jedem neuen Vorlagen-Paket laufen lassen.
Es zeigt, ob neue Autos oder umbenannte Ebenen dazugekommen sind.

### Aufbau

- `src/lib/templatePackage.ts` liest Zip und PSDs in einem Web Worker (ag-psd), skaliert die Ebenen auf 2048 und schneidet die Logos zu.
- `src/lib/templateLayers.ts` ordnet die von Hand benannten Ebenen Rollen zu (Lackzone, Felgen, Details, UV-Gitter).
- `src/lib/composition.ts` baut daraus Hintergrund, Overlay und die Maske der sichtbaren Lackfläche, in der Ebenen-Reihenfolge der PSD.
- `src/editor/LiveryEditor.ts` ist die Zeichenfläche (Fabric.js) mit Ebenen, Verlauf und Export-Rendering.
- `src/lib/modExport.ts` schreibt Manifest, Zip und den `LocalLiveries`-Ordner.
- `src/ui/` enthält die React-Oberfläche.

Die Werte in `src/lib/vehicles.ts` stammen aus den Fahrzeug-Tags von mod.io (Stand 15.10.2026).
Zwei Vorlagen heißen anders als ihr Auto: `BullV1` ist `Bull`, `DingDing` ist `Ding`.

## Grenzen

- Gemalt wird auf dem flachen UV-Layout, es gibt keine 3D-Vorschau im Browser.
  Die 3D-Ansicht liefert das Spiel selbst über „Refresh local mods“.
- Ein Motiv, das über mehrere Karosserieteile laufen soll, muss pro Teil gesetzt werden.
- Ein Design pro Auto; Mods mit mehreren Lackierungen (Team-Pakete) kann der Editor noch nicht bauen.
