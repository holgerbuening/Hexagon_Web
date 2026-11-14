# Hexagon Autorenstudio

Das Autorenstudio ist eine lokale Anwendung für Missionsentwürfe und Kampagnen.
Es verwendet den Kartenrenderer, die Einheiten, die Spiellogik und die KI des Spiels.

## Starten

```sh
npm run dev:editor
```

Danach im Browser **http://127.0.0.1:5174/author/index.html** öffnen.
Die Konsole zeigt gegebenenfalls einen anderen Port an, falls 5174 belegt ist.
Der Server bindet ausschließlich an die lokale Loopback-Adresse.

Der normale Spielstart bleibt `npm run dev`.

## Mission erstellen

1. Eine Kampagne auswählen oder mit „+ Kampagne“ anlegen.
2. Eine Mission auswählen oder mit „+“ hinzufügen.
3. Titel, Kennung, KI-Schwierigkeit und Startgeld einstellen.
4. Die Karte bearbeiten: Gelände, Straßen, Einheiten und Besitzer auswählen,
   dann auf das Zielfeld klicken. Mit der rechten Maustaste die Karte verschieben;
   das Mausrad zoomt. „Zentrieren“ stellt die Übersicht wieder her.
5. Alternativ „Karte / Spielstand laden“ verwenden. Karten werden ohne Einheiten
   übernommen. Spielstände werden zu einem neuen Start normalisiert: Runde 1,
   Spieler beginnt, kein Spielende, Einheiten können wieder handeln.
   Lebenspunkte, Erfahrung und Kampfwerte bleiben erhalten.
6. „Startaufstellung erzeugen“ setzt auf einer geeigneten Karte für beide Seiten
   ein HQ und drei Truppen. Eine vorhandene Aufstellung wird nach Rückfrage ersetzt.
7. Einzelne Felder auswählen und Einheitenwerte im Feldinspektor ändern.
8. Briefing, Bild sowie Texte für Sieg und Niederlage ergänzen.
9. Prüfpunkte beheben und „Mission testen“ wählen. Der Test läuft gegen die
   gewählte KI im gleichen Tab. „Zurück zum Editor“ lädt den unveränderten Entwurf.

Der Mensch spielt Besitzer `0`, die KI Besitzer `1`. Der Mensch beginnt immer.
Die bestehende Siegbedingung gilt: gegnerische HQs ausschalten.
Mindestens ein HQ je Seite ist für den Test erforderlich. Einheiten im Wasser
werden als Fehler gemeldet. Die Prüfung ersetzt keinen Test auf Spielbalance
oder Erreichbarkeit der gegnerischen Stellungen.

Die Kennung darf Buchstaben, Zahlen, Unterstriche und Bindestriche enthalten.
Sie ist von Titel und Reihenfolge unabhängig und sollte nach Veröffentlichung
nicht mehr geändert werden.

Bilder werden als PNG, JPEG, WebP oder GIF (max. 5 MB pro Bild) in die Datei
eingebettet. Für kleinere Exporte und zuverlässige Browsersicherung möglichst
kompakte Bilder verwenden. SVG und ausführbares HTML werden nicht übernommen.

## Kampagnen verwalten

Im Bereich „Kampagnenverwaltung“ Titel, Kurzbeschreibung, Titelbild,
Einleitung und Abschluss hinterlegen. Die Pfeile in der Missionsfolge ändern
die Reihenfolge. „Bearbeiten“ öffnet die jeweilige Mission.

Mehrere Kampagnen können gleichzeitig im lokalen Arbeitsbereich liegen.
„Importieren“ lädt eine Kampagne zusätzlich oder fügt eine einzelne Mission
zur aktuellen Kampagne hinzu. Bei einer bereits vorhandenen Kennung wird eine
Kopie mit neuer Kennung angelegt. Ungültige Dateien ersetzen keinen Entwurf.

## Speichern und Exportieren

Änderungen werden im lokalen Browserspeicher unter
`hexagon-author-workspace-v1` gesichert. Das gilt für denselben Browser,
dieselbe Adresse und denselben Port. Löschen der Browserdaten löscht auch diese
Sicherung. Ist der Speicher voll oder gesperrt, zeigt die Anwendung dies an;
die Änderungen bleiben dann nur im Arbeitsspeicher.

- **Mission exportieren:** eigenständige `*.mission.json`-Datei.
- **Kampagne exportieren:** eigenständige `*.campaign.json`-Datei mit allen
  Missionsvorlagen und Bildern in der festgelegten Reihenfolge.
- **Rückgängig:** bis zu 30 Änderungen während der aktuellen Sitzung.

Entwürfe dürfen mit offenen Prüfpunkten exportiert werden. Fehlerhafte
Dateistrukturen werden beim Import und Export abgewiesen. Vor dem Test müssen
alle spielrelevanten Prüfpunkte der Mission behoben sein.

Regelmäßig als Datei exportieren; die Browsersicherung ist kein dauerhafter
Ersatz dafür. Importierte Dateien werden vor ihrer Übernahme geprüft.
Der Test verändert keine Missionsvorlage und keinen Kampagnenfortschritt.

## Builds und Veröffentlichung

```sh
npm run build          # nur das normale Spiel → dist/
npm run build:editor   # Autorenstudio + Testspiel → dist-author/
npm run preview:editor # lokalen Autoren-Build ansehen (Port 4174)
npm run build:publish  # Spiel + Autorenstudio + Testspiel gemeinsam → dist/
npm run preview        # gemeinsames Paket lokal ansehen (Port 4173)
```

Der gemeinsame Build enthält folgende Einstiege:

- `/`: das normale Spiel.
- `/author/` bzw. `/author/index.html`: das öffentlich zugängliche Autorenstudio.
- `/author/play.html`: Testspiel für die im Editor gewählte Mission.

Für den separaten Autoren-Build ist die Vorschau unter
**http://127.0.0.1:4174/author/** erreichbar. Beim gemeinsamen Build unter
**http://localhost:4173/author/**.

Das Studio wird ohne Passwort und ohne Menülink im normalen Spiel bereitgestellt.
Jeder mit der Adresse kann es verwenden. Entwürfe bleiben im jeweiligen Browser;
der Editor kann keine Dateien auf den Spielserver schreiben oder Kampagnen dort
veröffentlichen. Missionen werden weiterhin als JSON exportiert und bewusst in
den Kampagnenkatalog des Projekts übernommen. Lokale Entwürfe aus der Entwicklung
lassen sich über Export und Import in den öffentlichen Editor übertragen.

Für das Deployment auf den bestehenden Server:

```sh
npm run deploy:preview # baut das vollständige Paket und zeigt rsync-Änderungen
npm run deploy         # baut und veröffentlicht nach /var/www/html/
```

Das versionierte Skript ist `tools/deploy-public.sh`; der lokale Einstieg
`deploy.sh` ruft es ebenfalls auf. Deployment immer mit dem gemeinsamen Build
vornehmen: `rsync --delete` aus einem reinen Spielbuild würde das Autorenstudio
wieder entfernen. Auf dem Webserver muss `index.html` als Verzeichnisindex aktiv
sein, damit `/author/` direkt funktioniert. Es wird keine zusätzliche Server-API
und kein Passwortschutz benötigt.

Exportierte Kampagnen können jetzt im normalen Spiel über **Campaigns** gespielt
werden. Ablage der JSON-Dateien, Katalog und Bildpfade sind unter
[Kampagnen veröffentlichen und spielen](KAMPAGNEN.md) beschrieben.
