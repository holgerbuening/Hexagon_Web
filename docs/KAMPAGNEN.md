# Kampagnen im Spiel

Im Hauptmenü öffnet **Campaigns** die Kampagnenauswahl. Dort lassen sich
veröffentlichte Kampagnen auswählen oder exportierte Dateien direkt über
**Load campaign file** öffnen.

## Deine erste Kampagne veröffentlichen

Lege die aus dem Autorenstudio exportierte Kampagne so ab:

```text
public/
  campaigns/
    index.json
    meine-kampagne/
      campaign.json
```

Der Dateiname des Exports darf dafür in `campaign.json` umbenannt werden.
Die Kennung **innerhalb** der Datei bleibt erhalten. Die Kampagne enthält bereits
alle Missionen; einzelne Missionsdateien müssen nicht zusätzlich abgelegt werden.

Ergänze in `public/campaigns/index.json` den relativen Pfad:

```json
{
  "version": 1,
  "campaigns": [
    "meine-kampagne/campaign.json"
  ]
}
```

Für weitere Kampagnen zusätzliche Einträge in dieser Liste anlegen. Eine
Kampagne muss alle Missionsprüfungen bestehen: eindeutige Kennungen, Titel,
HQs für beide Seiten und keine Einheiten auf Wasser. Fehler einer Kampagne
werden in der Auswahl angezeigt, ohne andere Kampagnen auszublenden.

Danach wie gewohnt `npm run build` ausführen und **dist/** veröffentlichen.
Vite übernimmt Dateien aus `public/` in den Spielbuild. Im Entwicklungsserver
sind sie direkt erreichbar. Weder das Autorenstudio noch `dist-author/` müssen
auf den öffentlichen Server kopiert werden.

## Bilder

**Im Autorenstudio hochgeladene Bilder sind bereits als Daten in der
Kampagnendatei eingebettet.** Dafür musst du keine weiteren Dateien kopieren.

Wenn du Bilder lieber als einzelne Dateien bereitstellen möchtest:

```text
public/images/campaigns/meine-kampagne/
  titel.jpg
  mission-1.jpg
  mission-2.jpg
```

Setze das oberste `image`-Feld der Kampagne beispielsweise auf:

```json
"image": "/images/campaigns/meine-kampagne/titel.jpg"
```

In der jeweiligen Mission wird deren `image`-Feld entsprechend gesetzt:

```json
"image": "/images/campaigns/meine-kampagne/mission-1.jpg"
```

`public/` gehört **nicht** zum Bildpfad in der JSON-Datei. Verwende PNG, JPEG,
WebP oder GIF; für einfache Dateipfade möglichst Dateinamen ohne Sonderzeichen.
Ein Pfad relativ zu `campaign.json` wird nicht unterstützt. Externe Bilder
müssen auch beim direkten Laden einer Kampagnendatei unter den angegebenen
`/images/`-Adressen im Spiel verfügbar sein.

## Ablauf und Fortschritt

1. **Campaigns** öffnen und die erste Mission auswählen.
2. Die Einleitung der Kampagne lesen, anschließend das Missionsbriefing mit Bild.
3. **Start mission** lädt die vorbereitete Aufstellung gegen die zugeordnete KI.
4. Ein Sieg schaltet die nächste Mission frei. **Next mission** öffnet ihr Briefing.
5. Bei einer Niederlage startet **Retry mission** dieselbe unveränderte Vorlage.
6. Nach der letzten Mission zeigt **Complete campaign** die Erfolgsmeldung der Kampagne.

Die Schwierigkeit folgt den Einstellungen jeder Mission und kann während einer
Kampagnenmission nicht in den Spieleinstellungen verändert werden.
Einheiten und Geld werden nicht zwischen Missionen übertragen; jede Mission
beginnt mit ihrer eigenen vorbereiteten Aufstellung.

Der Fortschritt und der laufende Spielstand werden lokal nach Aktionen gesichert.
**Continue campaign** setzt den gespeicherten Stand fort. Bereits abgeschlossene
Missionen können erneut gespielt werden. Direkt geladene Kampagnen erscheinen
nach dem ersten Missionsstart ebenfalls in der lokalen Kampagnenauswahl.
Ausstehende KI-Kämpfe werden mit ihrem bereits berechneten Ergebnis mitgesichert.

Über **Save Game** kannst du einen vollständigen Kampagnenspielstand als Datei
sichern. **Load Game** stellt sowohl das laufende Spiel als auch die Zuordnung
zur Kampagne wieder her. Normale ältere Spielstände bleiben ladbar.

Die Browsersicherung gilt nur für denselben Browser, dieselbe Adresse und
denselben Port. Bei vollem oder gesperrtem Speicher zeigt das Spiel einen Hinweis;
nutze dann **Save Game**. Exportiere wichtige Spielstände auch unabhängig davon
regelmäßig. Kennungen veröffentlichter Kampagnen und Missionen sollten stabil
bleiben, damit die Zuordnung zum Fortschritt erhalten bleibt.
