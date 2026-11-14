# Archiv: HQ-Upgrade zum Preis von 400

Stand: 14. November 2026. Befestigung kostet 400 und erhöht die Grundverteidigung
von 10 auf 200. Lebenspunkte und Erfahrung bleiben erhalten.

## Eingebaute Regel

Die KI prüft die Befestigung vor dem normalen Truppeneinkauf. Standardmäßig gilt
für alle drei Schwierigkeitsstufen:

- Mindestens **sechs Kampfeinheiten** müssen bereits vorhanden sein.
  HQs, Sanitäter und Pioniere zählen dafür nicht.
- Mindestens **800 Geld** müssen verfügbar sein: 400 für die Befestigung und
  mindestens 400 für anschließende Truppenkäufe. Die Reserve darf noch im selben
  Zug für Einheiten ausgegeben werden.
- Es muss eine gegnerische Kampfeinheit mit Angriffswert über null in höchstens
  100 Hexfeldern Entfernung geben. Bei mehreren HQs wird dasjenige mit der
  nächsten Bedrohung berücksichtigt.
- Gegen auf dem Landweg unerreichbare Nahkampfeinheiten wird nicht befestigt.
  Gegner, die bereits über Wasser hinweg schießen können, zählen als Bedrohung.
- Es wird höchstens ein HQ pro Zug aufgerüstet. Bereits befestigte oder im
  Missionseditor auf mindestens 200 Verteidigung gesetzte einfache HQs werden
  übersprungen.
- Die KI spart standardmäßig **nicht eigens** für das Upgrade und setzt dafür
  keinen Truppeneinkauf aus. Ohne ausreichenden Überschuss werden normale
  Einheiten gekauft. Eine feste Runde wird nicht vorausgesetzt.

Die Kamera behandelt die Befestigung wie einen Einkauf am jeweiligen HQ.
Spieler und KI verwenden dieselbe Funktion für den Austausch der Basis.

## Vergleichsstrategien

Die Vorstudie verglich jede Variante mit derselben KI ohne HQ-Upgrades.

| Variante | Kampfeinheiten vorher | Reserve nach Upgrade | Gegnerdistanz | Max. Sparzüge |
|---|---:|---:|---:|---:|
| `immediate` | 0 | 0 | 100 | 2 |
| `reserve` | 3 | 150 | 100 | 1 |
| `threatened` | 3 | 150 | 8 | 1 |
| `late` (gewählter Standard) | 6 | 400 | 100 | 0 |

Getestet wurden pro Serie 40 Partien auf 12×10- und 20×20-Karten. Jede Karte
wurde zweimal mit vertauschten Startseiten gespielt. Die Vorauswahl lief mit
normaler Schwierigkeit auf Seeds 101–120. Die beiden besten Varianten wurden
auf neuen Seeds 10101–10120 mit normaler und schwerer Schwierigkeit gegen
„kein Upgrade“ geprüft und anschließend direkt auf Seeds 20101–20120 verglichen.
Die Vorstudie umfasst damit insgesamt **800 Partien**.

Beide Seiten haben innerhalb eines Vergleichs denselben Schwierigkeitsgrad und
denselben Einkommensmultiplikator. Das Limit liegt bei 240 einzelnen Spielerzügen
(ungefähr 120 vollständigen Runden). Nicht entschiedene Spiele zählen als Remis.
Die Vorauswahl verwendet Siege plus einen halben Punkt je Remis.

## Ergebnisse der Vorstudie

| Phase | Upgrade-Variante | Gegner | Partien | Siege | Niederlagen | Remis |
|---|---|---|---:|---:|---:|---:|
| screening | immediate | never | 80 | 37 | 36 | 7 |
| screening | reserve | never | 80 | 34 | 38 | 8 |
| screening | threatened | never | 80 | 33 | 42 | 5 |
| screening | late | never | 80 | 37 | 37 | 6 |
| validation | immediate | never | 160 | 66 | 82 | 12 |
| validation | late | never | 160 | 69 | 71 | 20 |
| head-to-head | immediate | late | 160 | 67 | 78 | 15 |

`late` erzielt im direkten Vergleich mit der frühen Variante insgesamt
**78 Siege, 67 Niederlagen und 15 Remis**. Gegen „kein Upgrade“ ergibt die
unabhängige Validierung dagegen **69 Siege, 71 Niederlagen und 20 Remis**.
Ein allgemeiner Gewinn an Spielstärke gegenüber „niemals aufrüsten“ ist damit
nicht nachgewiesen. Die gewählte Regel ist eine vorsichtige wirtschaftliche
Heuristik: erst die Armee finanzieren, dann statische Verteidigung bezahlen.

## Zusätzlicher Kontrolllauf

Mit den endgültigen Standardparametern wurden weitere **80 Partien** auf neuen
Seeds 30101–30120 gegen die normale KI ohne Upgrade gespielt:

| Karte | Partien | Siege | Niederlagen | Remis | Partien mit Upgrade | Mittlerer erster Upgrade-Spielzug |
|---|---:|---:|---:|---:|---:|---:|
| 12×10 | 40 | 19 | 19 | 2 | 2 | 58,5 |
| 20×20 | 40 | 16 | 21 | 3 | 22 | 44,0 |

Auch dieser Kontrolllauf zeigt keinen gesicherten Vorteil gegenüber einer KI
ohne Upgrade. Die frühe Ausgabe von 400 erwies sich insgesamt als riskanter als
die vorsichtige Variante. Ein „optimaler Upgradezeitpunkt“ für alle Situationen
lässt sich aus diesen Serien nicht ableiten. Die angegebenen Mittelwerte zählen
abwechselnde Spielerzüge, nicht volle Runden, und berücksichtigen nur Partien,
in denen tatsächlich aufgerüstet wurde.

Die insgesamt 880 Vergleichspartien betreffen prozedurale Karten und KI gegen
KI. Andere Karten, menschliche Gegner und längere Spiellimits können andere
Ergebnisse liefern. Die vorhandenen Tests prüfen ergänzend Kosten, Reserve,
Truppenstärke, Wasserbarrieren, Original-Lebenspunkte und einmaliges Aufrüsten.

## Reproduzieren und weiter abstimmen

```sh
npm run simulate -- --upgrade-study --games 40 --seed 101 --max-turns 240
```

Die Studie schreibt ihre Einzelergebnisse nach jedem Block nach
`.sim-build/hq-upgrade-study.json`. Ein eigener Zielpfad ist mit
`--report <datei.json>` möglich. Archivierte Ergebnisse dieses Laufs stehen in
[KI-HQ-UPGRADE-400-RESULTS.json](KI-HQ-UPGRADE-400-RESULTS.json).

Einzelner Vergleich der aktuellen KI gegen dieselbe KI ohne Befestigungen:

```sh
npm run simulate -- --games 40 --paired --seed 30101 --width 20 --height 20 --max-turns 240 --b-set hqUpgradeEnabled=false
```

Die Parameter lassen sich für beide Seiten unabhängig überschreiben:

```sh
npm run simulate -- --games 40 --paired --a-set hqUpgradeMinArmy=3,hqUpgradeReserve=150,hqUpgradeThreatDistance=8,hqUpgradeSavingTurns=1 --b-set hqUpgradeEnabled=false
```

`--paired` benötigt eine gerade Partienzahl. `hqUpgradeEnabled=false` deaktiviert
die Funktion. Die Ausgabe enthält die Anzahl der Upgrades, die Anzahl betroffener
Partien und den mittleren ersten Upgrade-Spielzug je Seite.
