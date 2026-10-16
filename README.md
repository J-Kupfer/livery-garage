# Livery Garage

Ein Browser-Editor für eigene Lackierungen (Liveries) in [over the hill](https://store.steampowered.com/app/2929250/).
Fan-Projekt, nicht von Funselektor.

Du malst auf den offiziellen Vorlagen, legst Logos, Text und Formen darauf und bekommst am Ende genau das, was der [offizielle Livery-Guide](https://mod.io/g/over-the-hill/r/official-livery-modding-guide) verlangt: `manifest.json`, Textur (2048 × 2048) und Icon (512 × 512).

## Was der Editor kann

- Das offizielle Vorlagen-Paket (Zip mit 21 PSDs) direkt im Browser einlesen, ohne Photoshop.
- Lack pro Zone wählen: Karosserie, Zweitfarbe oder Dach, mit den Werksfarben, einer eigenen Farbe, einem Muster oder einem Verlauf, dazu die Felgen-Varianten.
- Lack-Verläufe laufen von den Schwellern bis zur Dachmitte, auf beiden Fahrzeugseiten gleich, oder der Länge nach über das Auto.
- Muster als Lack: Woodland, Digital-Tarn, Tigerstreifen, Flecktarn, Zebra und Leopard, mit Farbvorlagen oder eigenen Farben, einstellbarer Größe und „Neu würfeln“.
- Gebrauchsspuren: Rost und Kratzer mit je einem Regler; Dreck und Staub macht das Spiel selbst.
- Ebenen hinzufügen: Sponsor-Logos aus dem Paket, eigene Bilder, Text in acht Schriften, Streifen, Rechtecke, Kreise, Hot-Rod-Flammen mit Farbverlauf und Sticker (Startnummer rund oder als Schild, Sonnenblende, Zielflagge).
- Freie Flächen zeichnen: Ecken anklicken, ein Klick auf die erste Ecke schließt die Form, eckig oder geschwungen.
  Damit entsteht jede Form, von der Farbfläche entlang einer Karosserielinie bis zum Swoosh; die Ecken lassen sich danach verschieben.
- Zierlinien zeichnen: Punkte anklicken, der Editor legt eine geschwungene oder eckige Linie hindurch, durchgehend, gestrichelt oder gepunktet und auf Wunsch mit Kontur.
  Die Punkte lassen sich danach auf der Fläche verschieben.
- Freihand malen mit einstellbarer Glättung; alle Striche eines Durchgangs landen in einer Ebene, mit „Weiter malen“ kommen später neue dazu.
- Formen, Flächen und Text lassen sich mit einer Farbe, einem Verlauf (auch ins Durchsichtige auslaufend) oder einem der Muster füllen.
- Text lässt sich im Bogen biegen, etwa über oder unter einer Startnummer.
- Bei Bildern entfernt „Weiß entfernen“ einen weißen Hintergrund ohne hellen Rand, „Einfärben“ färbt das Motiv in einer Farbe.
- Jede Ebene hat einen Bereich: „Lack“ (unter Fenstern und Lichtern, auf den Lack zugeschnitten), „Scheiben“ (auf den Fensterscheiben, etwa als Sonnenblende) oder „Frei“.
- Hilfslinien und Einrasten beim Verschieben: an Kanten und Mitten anderer Ebenen, an der Mittellinie des Autos und an der gespiegelten Stelle auf der anderen Fahrzeugseite.
  Mit gedrückter Strg-Taste schiebt man frei, der Magnet-Knopf neben dem Zoom schaltet das Einrasten ganz ab.
- „Auf die andere Seite“ kopiert eine Ebene an die passende Stelle der anderen Fahrzeugseite: Text, Nummern und Logos bleiben lesbar, Flammen, Linien und Formen werden gespiegelt.
- Mehrere Ebenen lassen sich gruppieren, verschieben und gemeinsam auf die andere Seite kopieren.
- Rückgängig und Wiederholen, automatisches Speichern pro Auto, Designs als Datei mit Freunden teilen.
- Export als fertiges Zip für mod.io.
- Direkt in den Ordner `LocalLiveries` des Spiels schreiben, auf Wunsch live nach jeder Änderung.

## Online nutzen

Der Editor läuft ohne Installation unter <https://j-kupfer.github.io/livery-garage/>.
Für „Ins Spiel senden“ die Seite in Chrome oder Edge auf dem Windows-Rechner öffnen, auf dem over the hill läuft.
Das Vorlagen-Paket lädt jede Person selbst, es bleibt im eigenen Browser.

## Lokal starten

Voraussetzung ist Node.js 22.18 oder neuer.

```bash
npm install
```

```bash
npm run dev
```

Danach `http://localhost:5173` öffnen.
Beim ersten Start fragt der Editor nach dem Vorlagen-Paket.
Den Download verlinkt der Startbildschirm direkt ([offizielle Datei auf Google Drive](https://drive.google.com/file/d/1OpPvbBMt0BfWtaGPjOJ2EZZSwvpurqtJ/view?usp=sharing)).
Das Zip bleibt danach im Browser gespeichert.

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
- `src/lib/patterns.ts` erzeugt die Tarnmuster aus Rauschen; ein Muster ist nur Art, Farben, Größe und Zufallswert, das Bild entsteht jedes Mal gleich neu.
- `src/lib/flames.ts` erzeugt die Flammen-Umrisse aus einem Zufallswert.
- `src/lib/weathering.ts` erzeugt Rost und Kratzer, `src/lib/stickers.ts` beschreibt die Sticker-Vorlagen.
- `src/lib/lines.ts` legt Zierlinien und freie Flächen durch ihre Punkte (Catmull-Rom-Kurve), `src/editor/PointPath.ts` gibt ihnen die Punkt-Griffe, `src/editor/Pinstripe.ts` und `src/editor/Area.ts` sind die beiden Ebenen-Arten.
- `src/lib/fills.ts` beschreibt Verläufe und Muster als Füllung, `src/editor/filters.ts` den Bildfilter „Weiß entfernen“.
- `src/lib/brush.ts` glättet die Pinselstriche: die Pinselspitze hängt an einem kurzen Faden hinter dem Mauszeiger.
- `src/lib/symmetry.ts` findet die Spiegelachse zwischen den beiden Fahrzeugseiten: In allen Vorlagen liegt eine Seite kopfüber über dem Dach, die andere darunter.
  `src/lib/snapping.ts` berechnet daraus und aus den anderen Ebenen das Einrasten.
- `src/editor/LiveryEditor.ts` ist die Zeichenfläche (Fabric.js) mit Ebenen, Verlauf und Export-Rendering.
- `src/lib/modExport.ts` schreibt Manifest, Zip und den `LocalLiveries`-Ordner.
- `src/ui/` enthält die React-Oberfläche.

Die Werte in `src/lib/vehicles.ts` stammen aus den Fahrzeug-Tags von mod.io (Stand 15.10.2026).
Zwei Vorlagen heißen anders als ihr Auto: `BullV1` ist `Bull`, `DingDing` ist `Ding`.

## Grenzen

- Gemalt wird auf dem flachen UV-Layout, es gibt keine 3D-Vorschau im Browser.
  Die 3D-Ansicht liefert das Spiel selbst über „Refresh local mods“.
- Ein Motiv, das über mehrere Karosserieteile laufen soll, muss pro Teil gesetzt werden.
  Muster laufen an den Kanten der Teile nicht nahtlos weiter; bei Tarnmustern fällt das kaum auf.
- Ein Design pro Auto; Mods mit mehreren Lackierungen (Team-Pakete) kann der Editor noch nicht bauen.
