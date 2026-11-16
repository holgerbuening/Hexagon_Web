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
mindestens ein eigenes HQ und keine Einheiten auf Wasser. Beim Standardziel
„Destroy enemy headquarters“ braucht auch die KI ein HQ. Je nach Ziel werden
zusätzlich Zielposition, Rundenanzahl oder vorhandene Städte und Industrien geprüft. Fehler einer Kampagne
werden in der Auswahl angezeigt, ohne andere Kampagnen auszublenden.

Danach `npm run build:publish` ausführen und **dist/** veröffentlichen, damit
das öffentliche Autorenstudio unter `/author/` ebenfalls erhalten bleibt.
Vite übernimmt Dateien aus `public/` in den Spielbuild. Im Entwicklungsserver
sind sie direkt erreichbar. Der gemeinsame Build enthält das Autorenstudio bereits; `dist-author/` muss
nicht zusätzlich auf den Server kopiert werden.

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
Auch das Missionsziel und sein Rundenfortschritt bleiben beim Fortsetzen erhalten.

## Missionsziele

Das Autorenstudio bietet neben dem bisherigen Ausschalten aller gegnerischen HQs
vier weitere Ziele: alle gegnerischen Einheiten vernichten, eine bestimmte Zahl
vollständiger Runden überleben, alle Städte und Industrien gleichzeitig besetzen
oder ein bestimmtes Feld besetzen. Der Verlust aller eigenen HQs führt immer
zur Niederlage. Eine Überlebensrunde zählt erst nach dem eigenen Zug und dem
anschließenden KI-Zug einschließlich aller Kämpfe.

Briefing und Spielanzeige nennen das Ziel; die Spielanzeige zeigt zusätzlich den
Fortschritt. Ein Positionsziel erhält eine goldfarbene Markierung auf der Karte.
Nach Erreichen des Ziels wird wie bisher die nächste Mission freigeschaltet.

Die optionale Eigenschaft `objective` gehört zur jeweiligen Mission, zum Beispiel:

```json
"objective": { "type": "survive", "rounds": 10 }
```

Weitere Typen sind `destroy-headquarters`, `eliminate-all`, `capture-all` und
`capture-position`. Letzterer enthält `position: { "q": 3, "r": 4 }` in axialen
Kartenkoordinaten; am einfachsten setzt du das Feld im Editor. Dateien ohne
`objective` verwenden weiterhin `destroy-headquarters`. Die Formatversion bleibt 1.

## Spielstände sichern

Über **Save Game** kannst du einen vollständigen Kampagnenspielstand als Datei
sichern. **Load Game** stellt sowohl das laufende Spiel als auch die Zuordnung
zur Kampagne wieder her. Normale ältere Spielstände bleiben ladbar.

Die Browsersicherung gilt nur für denselben Browser, dieselbe Adresse und
denselben Port. Bei vollem oder gesperrtem Speicher zeigt das Spiel einen Hinweis;
nutze dann **Save Game**. Exportiere wichtige Spielstände auch unabhängig davon
regelmäßig. Kennungen veröffentlichter Kampagnen und Missionen sollten stabil
bleiben, damit die Zuordnung zum Fortschritt erhalten bleibt.
