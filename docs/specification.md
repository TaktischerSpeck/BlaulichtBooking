# User Stories – Fahrzeugbuchung Feuerwehr

**Projekt:** Webbasierte Fahrzeugreservierung für eine Feuerwehr  
**Version:** 1.0 – Anforderungsspezifikation  
**Ziel:** Ein einfaches, mobilfähiges Buchungssystem ohne Benutzerkonten für Antragsteller und Freigabeberechtigte, mit PIN-Zugang, E-Mail-Freigaben, Google-Kalender-Integration und Unterstützung für Plesk und Docker.

## 1. Grundlegende Geschäftsregeln

- Die gesamte Website ist durch eine gemeinsame vierstellige PIN geschützt.
- Ausschließlich Administratoren benötigen einen persönlichen Login.
- Buchungen können ein oder mehrere Fahrzeuge umfassen.
- Fahrzeuge sind dynamisch konfigurierbar.
- Buchungen können stundenweise, ganztägig oder über mehrere Tage erfolgen.
- Ganztagsbuchungen gelten von 06:00 Uhr bis 23:59 Uhr.
- Mehrtägige Ganztagsbuchungen gelten durchgehend vom ersten Tag um 06:00 Uhr bis zum letzten Tag um 23:59 Uhr.
- Für individuelle Buchungen sind sämtliche Uhrzeiten und Zeiträume möglich.
- Genehmigte Buchungen werden mit Google Kalender synchronisiert.
- Namen der Buchenden sind im Belegungskalender sichtbar, E-Mail-Adressen niemals.
- Freigaben erfolgen über individualisierte, zeitlich begrenzte E-Mail-Links.
- Bestehende Buchungskonflikte werden Antragstellern und Freigabeberechtigten angezeigt.
- Eine Doppelbelegung darf nicht genehmigt werden.

---

## Epic 1 – Fahrzeugverwaltung

### US-001: Fahrzeuge dynamisch verwalten

**Als Administrator möchte ich Fahrzeuge erstellen, bearbeiten, deaktivieren und archivieren können, damit der Fahrzeugbestand ohne Programmänderung gepflegt werden kann.**

Akzeptanzkriterien:

- Beliebig viele Fahrzeuge können angelegt werden.
- Fahrzeugname, Funkrufname, Kennzeichen und Beschreibung sind bearbeitbar.
- Optional können Fahrzeugbilder und Sitzplatzanzahl hinterlegt werden.
- Deaktivierte Fahrzeuge sind nicht mehr neu buchbar.
- Historische Buchungen archivierter Fahrzeuge bleiben erhalten.

**Priorität: Muss**

### US-002: Individuelle Fahrzeugeinstellungen

Als Administrator möchte ich jedes Fahrzeug unabhängig konfigurieren können.

Akzeptanzkriterien:

- Jedes Fahrzeug besitzt einen eigenen Namen und eine eindeutige ID.
- Fahrzeuge können eine eigene Freigabegruppe besitzen.
- Die Google-Kalender-Zuordnung ist pro Fahrzeug konfigurierbar.
- Fahrzeuge können in einer frei definierbaren Reihenfolge angezeigt werden.

**Priorität: Muss**

### US-003: Fahrzeuge zeitweise sperren

Als Administrator möchte ich Fahrzeuge für bestimmte Zeiträume sperren können, etwa bei Werkstattaufenthalten oder technischen Defekten.

Akzeptanzkriterien:

- Sperrungen können einen beliebigen Zeitraum umfassen.
- Ein Grund kann hinterlegt werden.
- Sperrungen erscheinen im Belegungskalender.
- Neue Buchungsanfragen für diesen Zeitraum zeigen einen Konflikt.
- Betroffene bestehende Buchungen werden hervorgehoben.

**Priorität: Muss**

---

## Epic 2 – Fahrzeugbuchungen

### US-004: Ein oder mehrere Fahrzeuge auswählen

**Als Antragsteller möchte ich 1 bis n Fahrzeuge innerhalb einer einzigen Buchungsanfrage auswählen können.**

Akzeptanzkriterien:

- Alle aktiven Fahrzeuge werden als auswählbare Elemente angezeigt.
- Mehrfachauswahl ist möglich.
- Die Auswahl lässt sich jederzeit ändern.
- Jedes Fahrzeug kann nur einmal innerhalb derselben Anfrage ausgewählt werden.
- Alle Fahrzeuge einer Anfrage erhalten denselben Buchungszeitraum und Buchungszweck.
- Die Verfügbarkeit wird für jedes ausgewählte Fahrzeug separat geprüft.

**Priorität: Muss**

### US-005: Buchungsdaten erfassen

Als Antragsteller möchte ich die notwendigen Angaben ohne Benutzerkonto eingeben können.

Pflichtfelder:

- Vor- und Nachname
- E-Mail-Adresse
- Mindestens ein Fahrzeug
- Buchungszweck
- Startdatum und Startzeit
- Enddatum und Endzeit

Optionale Felder:

- Abteilung/Gruppe
- Weitere Bemerkungen

Akzeptanzkriterien:

- Pflichtfelder werden geprüft.
- Endzeit muss nach der Startzeit liegen.
- Die Buchung wird erst nach E-Mail-Bestätigung zur Freigabe weitergeleitet.

**Priorität: Muss**

### US-006: Ganztagsbuchungen

**Als Antragsteller möchte ich einen Ganztagsmodus auswählen können, der automatisch die gewünschten Zeiten setzt.**

Akzeptanzkriterien:

- Es existiert eine Auswahl „Ganztägig“.
- Bei einem Tag setzt das System 06:00 bis 23:59 Uhr.
- Bei mehreren Tagen wird der gesamte zusammenhängende Zeitraum reserviert.
- Beispiel: 02.11.–05.11. bedeutet 02.11. 06:00 Uhr bis 05.11. 23:59 Uhr.
- Die automatisch ermittelten Zeiten werden sichtbar dargestellt.

**Priorität: Muss**

### US-007: Individuelle Zeiträume

Als Antragsteller möchte ich statt einer Ganztagsbuchung beliebige Start- und Endzeiten festlegen können.

Akzeptanzkriterien:

- Datum und Uhrzeit sind separat auswählbar.
- Buchungen über Mitternacht sind zulässig.
- Mehrtägige Buchungen mit unterschiedlichen Start- und Endzeiten sind möglich.
- Zeiträume außerhalb von 06:00 bis 23:59 Uhr sind im individuellen Modus erlaubt.
- Sämtliche Zeiten werden in der Zeitzone Europe/Berlin verarbeitet und korrekt bei Sommer-/Winterzeitwechseln behandelt.

**Priorität: Muss**

### US-008: Buchungszusammenfassung

Als Antragsteller möchte ich vor dem Absenden alle Angaben nochmals kontrollieren können.

Akzeptanzkriterien:

- Alle ausgewählten Fahrzeuge werden angezeigt.
- Zeitraum und Buchungszweck werden angezeigt.
- Konflikte werden eindeutig hervorgehoben.
- Die Daten können vor dem Absenden korrigiert werden.
- Es wird darauf hingewiesen, dass die Anfrage noch keine bestätigte Reservierung ist.

**Priorität: Muss**

### US-009: Buchung ohne Login verwalten

Als Antragsteller möchte ich nach meiner Anfrage einen persönlichen Link erhalten, um den Status zu sehen oder eine Buchung zu stornieren.

Akzeptanzkriterien:

- Ein sicherer, zeitlich begrenzter Verwaltungslink wird per E-Mail verschickt.
- Status, Fahrzeuge, Zweck und Zeitraum werden angezeigt.
- Eine Stornierung ist nach zusätzlicher Bestätigung möglich.
- Freigabeberechtigte werden über relevante Stornierungen informiert.
- Änderungen an genehmigten Zeiträumen oder Fahrzeugen erfordern eine neue Konfliktprüfung und Freigabe.

**Priorität: Muss**

---

## Epic 3 – Konflikterkennung

### US-010: Konflikte bei der Fahrzeugauswahl erkennen

**Als Antragsteller möchte ich unmittelbar sehen, ob ausgewählte Fahrzeuge im gewünschten Zeitraum bereits gebucht oder angefragt sind.**

Akzeptanzkriterien:

- Konflikte werden vor dem Absenden geprüft.
- Die Prüfung erfolgt bei jeder Änderung an Fahrzeugen oder Zeitraum.
- Jedes ausgewählte Fahrzeug wird einzeln bewertet.
- Konflikte mit bestätigten Buchungen, offenen Anfragen und Fahrzeugsperren werden unterschieden.
- Es wird angezeigt, welches Fahrzeug und welcher Zeitraum betroffen sind.

**Priorität: Muss**

### US-011: Konfliktdetails anzeigen

Als Antragsteller möchte ich den Grund einer Überschneidung erkennen können.

Akzeptanzkriterien:

- Fahrzeugname wird angezeigt.
- Überschneidender Zeitraum wird angezeigt.
- Name des bisherigen Buchenden ist sichtbar.
- E-Mail-Adresse des bisherigen Buchenden bleibt verborgen.
- Status der vorhandenen Buchung ist erkennbar.
- Buchungen fremder Antragsteller können nicht verändert werden.

**Priorität: Muss**

### US-012: Konflikte bei der Freigabe anzeigen

**Als Freigabeberechtigter möchte ich vor meiner Entscheidung auf bestehende Konflikte hingewiesen werden.**

Akzeptanzkriterien:

- Konflikte sind auf der Genehmigungsseite deutlich sichtbar.
- Bestehende Buchungen und deren Zeiträume werden angezeigt.
- Name des bisherigen Buchenden wird angezeigt.
- Erneute Konfliktprüfung erfolgt unmittelbar vor der finalen Freigabe.
- Eine finale Genehmigung bei bestätigter Überschneidung ist nicht möglich.

**Priorität: Muss**

### US-013: Umgang mit offenen und bestätigten Konflikten

Als Antragsteller möchte ich trotz einer Überschneidung eine Anfrage erfassen können, damit ein Verantwortlicher den Sachverhalt prüfen kann.

Akzeptanzkriterien:

- Anfragen können auch bei vorhandenen Konflikten eingereicht werden.
- Sie werden entsprechend gekennzeichnet.
- Konflikte mit lediglich offenen Anfragen blockieren die endgültige Freigabe nicht grundsätzlich.
- Bestätigte Überschneidungen oder Fahrzeugsperren verhindern die endgültige Genehmigung.
- Der Antragsteller kann seinen Zeitraum ändern und eine erneute Freigabe auslösen.
- Konflikte dürfen auch bei parallelen Genehmigungsvorgängen nicht zu Doppelbelegungen führen.

**Priorität: Muss**

---

## Epic 4 – Freigabeverwaltung

### US-014: Freigabeberechtigte verwalten

Als Administrator möchte ich beliebig viele Personen zur Freigabe von Fahrzeugbuchungen hinterlegen können.

Akzeptanzkriterien:

- Name und E-Mail-Adresse jeder Person sind konfigurierbar.
- Personen können mehreren Fahrzeugen zugeordnet werden.
- Personen können deaktiviert werden.
- Freigabeberechtigte benötigen keinen Benutzeraccount.

**Priorität: Muss**

### US-015: Freigaberegeln pro Fahrzeug konfigurieren

Als Administrator möchte ich je Fahrzeug festlegen, wer eine Buchung genehmigen darf und wie viele Zustimmungen erforderlich sind.

Unterstützte Modelle:

- Eine Person von n entscheidet.
- Alle n Personen müssen zustimmen.
- Eine konfigurierbare Mindestanzahl von x aus n Personen muss zustimmen.

Akzeptanzkriterien:

- Die Freigaberegel ist je Fahrzeug individuell einstellbar.
- Entscheidungen werden je Person protokolliert.
- Mehrfachabstimmungen derselben Person werden verhindert.
- Eine Ablehnung beendet die Anfrage, wenn die vorgeschriebene Zustimmung damit unmöglich wird.
- Im Modus „Eine Person entscheidet“ ist die erste gültige Genehmigung oder Ablehnung ausschlaggebend.

**Priorität: Muss**

### US-016: Individuelle Freigabelinks

Als Freigabeberechtigter möchte ich eine E-Mail mit einem persönlichen Link erhalten, über den ich die Anfrage prüfen kann.

Akzeptanzkriterien:

- Jeder Empfänger erhält einen eigenen Token.
- Tokens sind an Anfrage und Empfänger gebunden.
- Der Link öffnet die Buchungsdetails.
- Die Website-PIN wird auch für diese Seite benötigt.
- Die Entscheidung erfolgt erst nach aktivem Klick auf Genehmigen oder Ablehnen.
- Abgelaufene und widerrufene Tokens werden zurückgewiesen.

**Priorität: Muss**

### US-017: Anfrage genehmigen oder ablehnen

Als Freigabeberechtigter möchte ich über die Website ohne Login entscheiden können.

Akzeptanzkriterien:

- Buchungsdetails sind sichtbar.
- Die ausgewählten Fahrzeuge werden angezeigt.
- Konflikte werden dargestellt.
- Genehmigung und Ablehnung sind als Aktionen verfügbar.
- Eine optionale Begründung kann hinterlegt werden.
- Eine endgültige Entscheidung wird bestätigt und protokolliert.

**Priorität: Muss**

### US-018: Mehrere Fahrzeuge unabhängig freigeben

Als Administrator möchte ich, dass bei einer Mehrfachbuchung die Freigaberegel jedes betroffenen Fahrzeugs berücksichtigt wird.

Akzeptanzkriterien:

- Jedes Fahrzeug durchläuft seine eigene erforderliche Freigabe.
- Verantwortliche erhalten nur die für sie relevanten Entscheidungsrechte.
- Eine Gesamtbuchung gilt erst dann als genehmigt, wenn alle Fahrzeuge freigegeben wurden.
- Wird ein Fahrzeug endgültig abgelehnt, wird im ersten Entwicklungsstand die gesamte Anfrage abgelehnt.
- Eine teilweise Genehmigung ist zunächst nicht vorgesehen.
- Erst nach vollständiger Genehmigung aller Fahrzeuge werden Google-Kalender-Einträge erzeugt.

**Priorität: Muss**

### US-019: Freigabestatus verfolgen

Als Administrator und Antragsteller möchte ich erkennen können, wie weit die Anfrage bearbeitet ist.

Akzeptanzkriterien:

- Der Gesamtstatus ist sichtbar.
- Bei mehreren Fahrzeugen ist auch der fahrzeugbezogene Status erkennbar.
- Bereits erfolgte Zustimmungen werden gezählt.
- Für Antragsteller werden keine unnötigen personenbezogenen Daten der Entscheider veröffentlicht.
- Die Entscheidungshistorie bleibt administrativ nachvollziehbar.

**Priorität: Muss**

---

## Epic 5 – Google-Kalender-Integration

### US-020: Google Kalender verbinden

**Als Administrator möchte ich einen Google Kalender anbinden können, in dem genehmigte Fahrzeugbuchungen automatisch erscheinen.**

Akzeptanzkriterien:

- Die Verbindung erfolgt über die Google Calendar API.
- Zugangsdaten werden serverseitig und sicher gespeichert.
- Eine bestehende Kalender-ID kann konfiguriert werden.
- Fahrzeuge können demselben oder unterschiedlichen Kalendern zugeordnet werden.
- Ein Verbindungstest ist im Adminbereich verfügbar.

**Priorität: Muss**

### US-021: Buchungen automatisch synchronisieren

Als Administrator möchte ich, dass genehmigte Buchungen ohne manuelle Arbeit als Kalendereinträge erstellt werden.

Akzeptanzkriterien:

- Für jedes gebuchte Fahrzeug wird ein eindeutig zuordenbarer Kalendereintrag erstellt.
- Fahrzeug, Antragsteller, Buchungszweck und Zeitraum werden übernommen.
- E-Mail-Adressen werden nicht in Titel, Beschreibung oder öffentlich sichtbare Kalenderfelder übernommen.
- Änderungen werden mit bestehenden Einträgen synchronisiert.
- Stornierungen werden im Kalender entfernt oder als storniert markiert.
- Google-Event-IDs werden intern gespeichert, damit keine Duplikate entstehen.

**Priorität: Muss**

### US-022: Fahrzeugkalender auf der Website anzeigen

Als Nutzer möchte ich die Fahrzeugbelegung in einer Kalenderansicht sehen können.

Akzeptanzkriterien:

- Monats-, Wochen- und Tagesansicht.
- Fahrzeuge sind optisch unterscheidbar.
- Es ist möglich, nach einzelnen Fahrzeugen zu filtern.
- Freie, angefragte, genehmigte und gesperrte Zeiträume sind unterscheidbar.
- Name des Buchenden, Buchungszweck und Zeitraum sind für Besucher mit gültiger PIN sichtbar.
- E-Mail-Adressen werden niemals angezeigt.
- Die Anzeige benötigt keinen Google-Login.

**Priorität: Muss**

### US-023: Datenschutz beim Google Kalender

Als Administrator möchte ich verhindern, dass durch die Kalenderintegration vertrauliche Daten öffentlich werden.

Akzeptanzkriterien:

- Die Anwendung überträgt ausschließlich freigegebene Kalenderinformationen.
- E-Mail-Adressen und personenbezogene Token werden niemals synchronisiert.
- Für öffentlich freigegebene Google-Kalender ist klar erkennbar, dass Namen dann außerhalb der PIN-geschützten Website sichtbar sein können.
- Der Standardbetrieb verwendet einen nicht öffentlich freigegebenen Google Kalender.
- Kalenderansichten auf der Website beziehen die Daten geschützt über das eigene Backend.

**Priorität: Muss**

### US-024: Synchronisierungsfehler behandeln

Als Administrator möchte ich erkennen und beheben können, wenn ein Kalendereintrag nicht synchronisiert werden konnte.

Akzeptanzkriterien:

- Fehlgeschlagene Synchronisierungen werden protokolliert.
- Automatische Wiederholungsversuche sind vorhanden.
- Der Status ist administrativ sichtbar.
- Die ursprüngliche Buchung bleibt in der Datenbank erhalten.
- Synchronisierungsfehler führen nicht zu doppelten Buchungen.

**Priorität: Muss**

---

## Epic 6 – PIN-Schutz und Sicherheit

### US-025: Vierstellige Website-PIN

**Als Nutzer möchte ich die Website durch die Eingabe einer gemeinsamen vierstelligen PIN betreten können.**

Akzeptanzkriterien:

- Beim ersten Zugriff erscheint eine PIN-Eingabeseite.
- Ausschließlich vierstellige numerische PINs sind zulässig.
- Nach erfolgreicher Eingabe wird eine zeitlich begrenzte Sitzung erstellt.
- Während einer gültigen Sitzung wird die PIN nicht bei jeder Aktion erneut abgefragt.
- Der Administrator kann die PIN ändern.
- PINs werden ausschließlich als sicherer Passwort-Hash gespeichert.
- Wiederholte Fehlversuche werden durch Rate-Limiting und zeitweise Sperren begrenzt.

**Priorität: Muss**

### US-026: Administrativer Login

Als Administrator möchte ich einen eigenen sicheren Login besitzen.

Akzeptanzkriterien:

- Benutzername oder E-Mail und Passwort.
- Keine administrativen Funktionen ohne Authentifizierung.
- Sichere serverseitige Sessions.
- Passwörter werden sicher gehasht.
- HTTPS ist verpflichtend.
- Optional kann später eine Zwei-Faktor-Authentifizierung ergänzt werden.

**Priorität: Muss**

### US-027: Rollen- und Rechteverwaltung

Als Administrator möchte ich sicherstellen, dass Nutzer ausschließlich berechtigte Funktionen ausführen können.

Akzeptanzkriterien:

- Besucher mit PIN dürfen Buchungen anfragen und den Belegungskalender ansehen.
- Freigabeberechtigte dürfen nur mit gültigem Token entscheiden.
- Antragsteller dürfen nur mit ihrem individuellen Verwaltungslink ihre Buchung verwalten.
- Administratoren dürfen Fahrzeuge, Freigabeberechtigte, Einstellungen und Buchungen verwalten.
- Alle Berechtigungen werden serverseitig kontrolliert.

**Priorität: Muss**

---

## Epic 7 – E-Mail und SMTP

### US-028: SMTP konfigurieren

**Als Administrator möchte ich ein bestehendes E-Mail-Postfach für den SMTP-Versand verwenden.**

Akzeptanzkriterien:

- SMTP-Hostname und Port sind konfigurierbar.
- STARTTLS und TLS werden unterstützt.
- SMTP-Benutzername und Passwort können hinterlegt werden.
- Absenderadresse und Absendername sind konfigurierbar.
- Secrets können über Umgebungsvariablen bereitgestellt werden.
- Eine Test-E-Mail kann versendet werden.
- Zugangsdaten erscheinen niemals in Logs oder im Frontend.

**Priorität: Muss**

### US-029: Automatische E-Mail-Benachrichtigungen

Als Beteiligter möchte ich bei relevanten Ereignissen automatisch informiert werden.

E-Mails bei:

- Eingang einer Buchungsanfrage und E-Mail-Verifizierung
- Anfrage zur Freigabe
- Genehmigung
- Ablehnung
- Stornierung
- Wesentlicher Buchungsänderung
- Optional: ausstehender Freigabe und bevorstehendem Buchungsbeginn

Akzeptanzkriterien:

- E-Mails enthalten nur die für den Empfänger erforderlichen Daten.
- Personalisierte Verwaltungs- und Freigabelinks werden korrekt erzeugt.
- Fehlgeschlagener Versand wird protokolliert und nach Möglichkeit erneut versucht.

**Priorität: Muss**

### US-030: E-Mail-Vorlagen verwalten

Als Administrator möchte ich die Texte der System-E-Mails anpassen können.

Akzeptanzkriterien:

- Unterschiedliche Vorlagen für die verschiedenen Ereignisse.
- Platzhalter für Fahrzeug, Name, Datum, Zeitraum und Buchungszweck.
- HTML- und Text-Versionen werden unterstützt.
- Eine Vorschaufunktion ist vorhanden.

**Priorität: Soll**

---

## Epic 8 – Administration und Buchungsübersicht

### US-031: Zentrale Buchungsverwaltung

Als Administrator möchte ich sämtliche Buchungsanfragen in einer Übersicht verwalten können.

Akzeptanzkriterien:

- Liste aller Buchungen.
- Filter nach Fahrzeug, Zeitraum und Status.
- Suche nach Antragsteller.
- Genehmigungshistorie einsehbar.
- Admin kann Buchungen stornieren oder bearbeiten.
- Administrative Änderungen werden protokolliert.

**Priorität: Muss**

### US-032: Manuelle Buchungen anlegen

Als Administrator möchte ich Reservierungen direkt eintragen können, ohne den regulären Freigabeprozess zu durchlaufen.

Akzeptanzkriterien:

- Admin kann Fahrzeuge, Zeiträume und Buchungszwecke auswählen.
- Konfliktprüfung wird auch hier durchgeführt.
- Bestätigte Überschneidungen werden nicht stillschweigend erzeugt.
- Nach dem Speichern erfolgt die Google-Kalender-Synchronisierung.
- Administrative Buchungen werden entsprechend gekennzeichnet.

**Priorität: Soll**

### US-033: Änderungsprotokoll

Als Administrator möchte ich Änderungen und Entscheidungen nachvollziehen können.

Akzeptanzkriterien:

- Buchungserstellung, Genehmigung, Ablehnung, Änderungen und Stornierung werden protokolliert.
- Zeitpunkt und verantwortliche Person beziehungsweise Aktion werden gespeichert.
- Vorherige und neue Werte relevanter Änderungen sind nachvollziehbar.
- Historische Informationen sind vor unberechtigter Manipulation geschützt.

**Priorität: Muss**

---

## Epic 9 – Deployment und Betrieb

### US-034: Deployment auf Plesk mit Node.js

**Als Betreiber möchte ich die Anwendung auf einem Plesk-Server mit Node.js betreiben können.**

Akzeptanzkriterien:

- Die Anwendung kann als Node.js-Anwendung gestartet werden.
- Ein Production-Build ist vorgesehen.
- Startkommando und Node.js-Version sind dokumentiert.
- Konfiguration erfolgt über Umgebungsvariablen.
- SMTP, Datenbank und Google-Kalender-Integration sind ohne Codeänderungen konfigurierbar.
- Reverse-Proxy-Betrieb und HTTPS werden unterstützt.
- Datenbankmigrationen sind dokumentiert und ausführbar.

**Priorität: Muss**

### US-035: Docker-Deployment

Als Betreiber möchte ich dieselbe Anwendung alternativ mit Docker starten können.

Akzeptanzkriterien:

- Ein produktionsfähiges Dockerfile ist vorhanden.
- Eine Docker-Compose-Konfiguration ist enthalten.
- Einstellungen werden über Umgebungsvariablen bereitgestellt.
- Persistente Daten sind bei Container-Neustarts geschützt.
- Healthchecks sind verfügbar.
- Das Deployment kann hinter einem Reverse Proxy betrieben werden.

**Priorität: Muss**

### US-036: Gemeinsamer Softwarestand

Als Entwickler möchte ich Plesk und Docker aus demselben Git-Repository betreiben können.

Akzeptanzkriterien:

- Identischer Anwendungscode für beide Umgebungen.
- Keine deploymentspezifischen Änderungen am Anwendungscode notwendig.
- Konfigurationsunterschiede werden über Umgebungsvariablen gelöst.
- Beispieldateien und Installationsanleitungen sind für beide Varianten vorhanden.
- Lokale Entwicklungsumgebung ist reproduzierbar.

**Priorität: Muss**

### US-037: Automatisches Dependency- und Patch-Management

**Als Entwickler möchte ich, dass das Git-Repository automatisch auf veraltete oder verwundbare Abhängigkeiten geprüft und mit Sicherheitsupdates versorgt wird.**

Akzeptanzkriterien:

- Dependabot oder Renovate ist konfiguriert.
- Automatische Prüfung aller Node.js-Abhängigkeiten.
- Automatische Update-Pull-Requests für Patch-, Minor- und Security-Updates.
- Docker-Basisimages werden ebenfalls überwacht.
- CI führt Tests, Linting, Build und Dependency-Sicherheitsprüfungen aus.
- Erfolgreich getestete Patch-Updates dürfen optional automatisch gemergt werden.
- Major-Updates benötigen eine manuelle Prüfung.
- Fehlgeschlagene Tests verhindern automatische Merges.
- Produktivdeployments erfolgen nur nach den festgelegten Freigaberegeln.

**Priorität: Muss**

### US-038: Datenbank und Migrationen

Als Betreiber möchte ich Buchungen, Fahrzeuge, Benutzer und Entscheidungen dauerhaft speichern können.

Akzeptanzkriterien:

- Verwendung einer persistenten relationalen Datenbank.
- Strukturierte Datenbankmigrationen sind enthalten.
- Buchungen, Fahrzeuge und Freigaben werden relational verknüpft.
- Gleichzeitige Zugriffe sind sicher verarbeitet.
- Datenbank-Backups und Wiederherstellung sind dokumentiert.
- Die Datenbank ist nicht direkt öffentlich erreichbar.

**Priorität: Muss**

---

## Epic 10 – Bedienbarkeit und Datenschutz

### US-039: Mobile Darstellung

Als Nutzer möchte ich das Buchungssystem problemlos auf Smartphones verwenden können.

Akzeptanzkriterien:

- Responsive Design.
- Touchoptimierte Fahrzeugauswahl.
- Gut bedienbare Datums- und Zeitauswahl.
- Lesbarer Kalender auf mobilen Geräten.
- Genehmigen und Ablehnen ohne horizontales Scrollen oder umständliche Bedienung.

**Priorität: Muss**

### US-040: Datenschutzgerechte Anzeige

Als Nutzer möchte ich die Fahrzeugbelegung nachvollziehen können, ohne Zugriff auf fremde Kontaktdaten zu erhalten.

Akzeptanzkriterien:

- Name des Buchenden darf im Kalender erscheinen.
- E-Mail-Adresse bleibt ausschließlich in berechtigten Verwaltungs- und Freigabeansichten verfügbar.
- Öffentliche API-Antworten enthalten keine vertraulichen Felder.
- Datenschutz- und Löschregeln sind dokumentiert.
- Buchungsdaten werden nicht länger als erforderlich aufbewahrt.

**Priorität: Muss**

### US-041: Eindeutige Statusdarstellung

Als Nutzer möchte ich Buchungszustände anhand verständlicher Farben und Beschriftungen erkennen können.

Unterstützte Status:

- E-Mail-Bestätigung ausstehend
- Freigabe ausstehend
- Genehmigt
- Abgelehnt
- Storniert
- Abgelaufen
- Abgeschlossen
- Konflikt vorhanden

Akzeptanzkriterien:

- Status sind sowohl textlich als auch visuell erkennbar.
- Konflikte sind deutlich hervorgehoben.
- Farbkennzeichnungen allein sind nicht die einzige Informationsquelle.

**Priorität: Muss**

---

## 11. Technische Regeln für die Implementierung

### Zeitmodell

- Speicherung aller Buchungen mit eindeutigem Start- und Endzeitpunkt.
- Ganztagsbuchungen werden in der Benutzeroberfläche bis 23:59 Uhr dargestellt.
- Intern wird ein eindeutiges Intervallmodell verwendet, vorzugsweise mit exklusivem Endzeitpunkt. Eine Buchung bis 23:59 einschließlich wird dabei intern als Ende um 00:00 Uhr des Folgetages gespeichert.
- Zeitüberschneidungen werden serverseitig geprüft.
- Die Konfliktprüfung erfolgt unmittelbar vor endgültiger Genehmigung erneut.

### Mehrfachbuchungen

- Eine Buchungsanfrage enthält eine gemeinsame Buchungs-ID.
- Darunter befinden sich 1 bis n Fahrzeugreservierungen.
- Jede Reservierung besitzt ihren eigenen Freigabestatus.
- Die Gesamtbuchung wird erst nach Freigabe sämtlicher Fahrzeuge bestätigt.
- Finale Buchungen werden atomar verarbeitet, damit parallele Genehmigungen keine Doppelbelegungen verursachen.

### Google Kalender

- Die eigene Anwendungsdatenbank ist die führende Datenquelle.
- Der Google Kalender dient zur Darstellung und Synchronisierung genehmigter Reservierungen.
- Buchungen werden innerhalb der Anwendung erstellt und geändert.
- Eine bidirektionale Synchronisierung extern bearbeiteter Google-Kalender-Termine gehört zunächst nicht zum Funktionsumfang.
- Manuell direkt in Google Kalender eingetragene Termine gelten daher nicht automatisch als verbindliche Fahrzeugsperrungen.

### Sicherheit

- Tokens werden kryptografisch sicher erstellt und nur gehasht gespeichert.
- E-Mail-Linkaufrufe dürfen keine Genehmigung automatisch auslösen.
- Freigabeentscheidungen benötigen eine explizite Aktion.
- PIN-Versuche, Formularversand und Tokenaufrufe werden gegen Missbrauch begrenzt.
- HTTPS ist für den produktiven Betrieb verpflichtend.
- Sicherheitsrelevante Änderungen werden protokolliert.

### Qualitätssicherung

Automatisierte Tests müssen mindestens diese Fälle abdecken:

- Einzel- und Mehrfachfahrzeugbuchungen
- Ganztags- und mehrtägige Reservierungen
- Individuelle Zeiträume und Buchungen über Mitternacht
- Sommer-/Winterzeitwechsel
- Überschneidende Buchungen und parallele Freigaben
- Freigabequoren und Ablehnungen
- Abgelaufene und ungültige Tokens
- Mehrfaches Absenden derselben Entscheidung
- SMTP-Fehler und Wiederholungsversuche
- Google-Kalender-Synchronisierung und fehlgeschlagene Aktualisierungen

---

## 12. Nichtfunktionale Anforderungen

**Performance:** Buchungsübersicht und Kalender sollen bei normaler Feuerwehr-Nutzung schnell reagieren.

**Zuverlässigkeit:** Buchungen müssen auch bei kurzfristigen Ausfällen von SMTP oder Google Kalender dauerhaft gespeichert bleiben.

**Wartbarkeit:** Frontend, Backend und Integrationen sollen klar voneinander getrennt sein.

**Sicherheit:** Keine Secrets im Repository; sämtliche Credentials werden über die Laufzeitumgebung bereitgestellt.

**Barrierefreiheit:** Formulare, Statusanzeigen und Bedienelemente sollen tastaturbedienbar und gut lesbar sein.

**Betrieb:** Plesk und Docker erhalten dieselben Funktionen, Datenbankmigrationen und Updateverfahren.

---

## 13. Geplante Entwicklungsphasen

### MVP – Erste produktiv nutzbare Version

Umsetzung von US-001 bis US-029 (ohne die optionale Vorlagenverwaltung), US-031, US-033 bis US-041.

Enthält:

- Dynamische Fahrzeugverwaltung
- PIN-Schutz und Admin-Login
- Buchung von 1 bis n Fahrzeugen
- Ganztags- und individuelle Zeiträume
- Konflikterkennung
- Flexible Freigabeprozesse per E-Mail
- SMTP-Versand
- Kalenderansicht
- Google-Kalender-Synchronisierung
- Plesk- und Docker-Deployment
- Automatisches Patch-Management
- Administrationsoberfläche

### Erweiterung

- Anpassbare E-Mail-Vorlagen
- Manuelle Admin-Buchungen
- Erinnerungsmails
- Wiederkehrende Buchungen
- ICS-Export
- Fahrzeug-Rückgabeprotokolle
- Statistiken und Auswertungen
- Optionale Integration externer Google-Kalender-Termine als Buchungssperren

---

## 14. Definition of Done

Eine User Story ist abgeschlossen, wenn:

1. Die beschriebenen Akzeptanzkriterien erfüllt sind.
2. Die Funktion auf Desktop und Smartphone bedienbar ist.
3. Serverseitige Validierung und Berechtigungsprüfung vorhanden sind.
4. Relevante automatische Tests erfolgreich durchlaufen.
5. Sicherheitsrelevante und personenbezogene Daten geschützt werden.
6. Die Funktion mit Plesk und Docker kompatibel ist.
7. Die Implementierung dokumentiert ist.
8. Der CI-Build ohne Fehler durchläuft.
