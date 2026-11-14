# KI: HQ-Upgrades zum Preis von 250

Stand: 14. November 2026. Befestigung kostet 250 und erhöht die Grundverteidigung
von 10 auf 200. Lebenspunkte und Erfahrung bleiben erhalten.

## Eingebaute Regel

Die KI prüft die Befestigung vor dem normalen Truppeneinkauf. Standardmäßig gilt
für alle drei Schwierigkeitsstufen:

- Mindestens **sechs Kampfeinheiten** müssen bereits vorhanden sein.
  HQs, Sanitäter und Pioniere zählen dafür nicht.
- Mindestens **650 Geld** müssen verfügbar sein: 250 für die Befestigung und
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
Die neue Studie zum Preis von 250 umfasst damit insgesamt **800 Partien**.
Karten, Seeds, Strategien und Spiellimit entsprechen dem vorigen Lauf zum Preis 400.

Beide Seiten haben innerhalb eines Vergleichs denselben Schwierigkeitsgrad und
denselben Einkommensmultiplikator. Das Limit liegt bei 240 einzelnen Spielerzügen
(ungefähr 120 vollständigen Runden). Nicht entschiedene Spiele zählen als Remis.
Die Vorauswahl verwendet Siege plus einen halben Punkt je Remis.

## Ergebnisse bei Preis 250

| Phase | Upgrade-Variante | Gegner | Partien | Siege | Niederlagen | Remis |
|---|---|---|---:|---:|---:|---:|
| screening | immediate | never | 80 | 41 | 30 | 9 |
| screening | reserve | never | 80 | 39 | 35 | 6 |
| screening | threatened | never | 80 | 40 | 36 | 4 |
| screening | late | never | 80 | 40 | 34 | 6 |
| validation | immediate | never | 160 | 83 | 68 | 9 |
| validation | late | never | 160 | 69 | 73 | 18 |
| head-to-head | immediate | late | 160 | 64 | 72 | 24 |

Im direkten Duell bleibt `late` mit **72 Siegen, 64 Niederlagen und 24 Remis**
knapp vor `immediate`. Deshalb bleibt die wirtschaftlich vorsichtige Variante
Standard. Die erforderliche Kasse sinkt durch die Preissenkung von 800 auf
**650**: Upgrade 250 plus Reserve 400.

## Vergleich mit dem früheren Preis 400

Die folgende Validierung verwendet für beide Preise dieselben frischen Karten,
Startseiten und Schwierigkeiten. Gegner ist jeweils die KI ohne HQ-Upgrades.

| Variante | Preis | Partien | Siege | Niederlagen | Remis |
|---|---:|---:|---:|---:|---:|
| immediate | 400 | 160 | 66 | 82 | 12 |
| immediate | 250 | 160 | 83 | 68 | 9 |
| late | 400 | 160 | 69 | 71 | 20 |
| late | 250 | 160 | 69 | 73 | 18 |

Die frühe Variante schneidet bei 250 gegen eine KI ohne Upgrade besser ab als bei
400. Für die späte Variante zeigt diese Validierungsserie hingegen keine
Verbesserung. Der günstigere Preis macht das Upgrade somit nicht in jeder
Situation oder gegen jeden Gegner automatisch zur besseren Investition.

## Zusätzlicher Kontrolllauf mit der Standardregel

Wie beim Preis 400 wurden weitere **80 Partien** auf Seeds 30101–30120 gegen die
normale KI ohne Upgrade gespielt. Alle Variantenwerte bleiben gleich; nur der
Preis des Upgrades ist anders.

| Karte | Preis | Partien | Siege | Niederlagen | Remis | Partien mit Upgrade | Mittlerer erster Upgrade-Spielzug |
|---|---:|---:|---:|---:|---:|---:|---:|
| 12×10 | 400 | 40 | 19 | 19 | 2 | 2 | 58.5 |
| 12×10 | 250 | 40 | 19 | 19 | 2 | 2 | 55.5 |
| 20×20 | 400 | 40 | 16 | 21 | 3 | 22 | 44.0 |
| 20×20 | 250 | 40 | 22 | 17 | 1 | 31 | 30.1 |

In diesem Kontrolllauf erzielt der neue Preis insgesamt **41 Siege, 36 Niederlagen
und 3 Remis**; beim Preis 400 waren es 35 Siege, 40 Niederlagen und 5 Remis.
Insbesondere auf den größeren Karten wird häufiger und früher befestigt.
Diese begrenzten Stichproben beweisen trotzdem keinen allgemein optimalen
Upgradezeitpunkt oder einen gesicherten Vorteil gegen alle Spielweisen.

Die Angaben zum ersten Upgrade sind Mittelwerte nur der Partien, in denen
aufgerüstet wurde. Sie zählen einzelne Spielerzüge, nicht vollständige Runden.
Die insgesamt **880 neuen Partien** betreffen prozedurale Karten, normale und
schwere KI sowie ein Limit von 240 Spielerzügen. Menschliche Gegner, Kampagnen
mit eigener Aufstellung und längere Spiellimits können andere Ergebnisse liefern.

## Reproduzieren

```sh
npm run simulate -- --upgrade-study --games 40 --seed 101 --max-turns 240 --report .sim-build/hq-upgrade-study-250.json
```

Die Berichte enthalten den tatsächlichen Upgradepreis, die Strategieparameter
und die Ergebnisse jedes Vergleichsblocks. Der vollständige neue Bericht liegt
unter [KI-HQ-UPGRADE-RESULTS.json](KI-HQ-UPGRADE-RESULTS.json). Die vorherige
Auswertung bleibt als [Archiv zum Preis 400](KI-HQ-UPGRADE-400.md) erhalten.

Kontrolllauf der aktuellen Standardregel:

```sh
npm run simulate -- --games 40 --paired --seed 30101 --width 20 --height 20 --max-turns 240 --b-set hqUpgradeEnabled=false --report .sim-build/hq-upgrade-control-250-large.json
```

Für die kleine Karte `--width 12 --height 10` verwenden. `--paired` spielt jede
Karte mit vertauschten Startseiten und benötigt eine gerade Partienzahl.
Eigene Strategien lassen sich über `--a-set` und `--b-set` einstellen:

```sh
npm run simulate -- --games 40 --paired --a-set hqUpgradeMinArmy=0,hqUpgradeReserve=0,hqUpgradeThreatDistance=100,hqUpgradeSavingTurns=2 --b-set hqUpgradeEnabled=false
```

`hqUpgradeEnabled=false` deaktiviert Aufrüstungen für die jeweilige Seite.
Die Simulation meldet außerdem Anzahl und mittleren Zeitpunkt der Upgrades.
