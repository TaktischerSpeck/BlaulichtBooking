# BlaulichtBooking

Fahrzeugbuchung für die Feuerwehr: mobil bedienbar, mit gemeinsamer PIN, individuellen E-Mail-Freigaben und einem eigenen Belegungskalender. Plesk und Docker verwenden denselben Node.js-Code. Unterstützt werden MariaDB/MySQL und optional SQLite. Die Ersteinrichtung läuft im Browser.

## Funktionsumfang

- Buchung von einem oder mehreren dynamisch verwaltbaren Fahrzeugen.
- Individuelle Zeiträume, über Mitternacht und mehrere Tage; Ganztagsmodus von 06:00 bis 23:59 Uhr, bei mehreren Tagen durchgehend.
- Zeitrechnung ausschließlich in `Europe/Berlin`, Speicherung als UTC-Zeitpunkte. Nicht eindeutige oder nicht existierende Ortszeiten während der Zeitumstellung werden mit verständlicher Rückmeldung abgelehnt.
- E-Mail-Bestätigung vor Weiterleitung an die Verantwortlichen. Antragsteller und Freigabepersonen brauchen keine Konten.
- Eigene Freigabegruppe je Fahrzeug: eine Person entscheidet, alle stimmen zu oder x aus n stimmen zu. Freigaberegel und berechtigte Personen werden pro Anfrage festgehalten.
- Gesamtgenehmigung erst nach Freigabe aller Fahrzeuge. Bei endgültiger Ablehnung eines Fahrzeugs wird die gesamte Anfrage abgelehnt.
- Offene Anfragen erzeugen Hinweise. Bestätigte Buchungen und Sperren verhindern die Genehmigung. Die abschließende Prüfung läuft transaktional: SQLite verwendet `BEGIN IMMEDIATE`, MariaDB/MySQL zusätzlich eine verbindungsgebundene Datenbanksperre, die auch getrennte Plesk-Prozesse koordiniert.
- Persönliche Verwaltungslinks für Status, Änderungen und Stornierung. Jede Änderung nimmt die bisherige Genehmigung zurück und startet die Freigabe neu.
- Monats-, Wochen- und Tagesansicht; Fahrzeugfilter und sichtbare Statusbeschriftungen. Buchende sind namentlich sichtbar, E-Mail-Adressen und Bemerkungen werden nicht über die Kalender-API ausgegeben.
- Verwaltung von Fahrzeugen, Freigabepersonen, Sperren, Buchungen, Zugang, Protokoll und Verbindungsstatus. Direkte Admin-Buchungen mit verbindlicher Konfliktprüfung sind ebenfalls enthalten.
- SMTP-Versand mit TLS/STARTTLS und Google Calendar API mit Service Account. Dauerhafte Warteschlange, Wiederholungsversuche und manuelles erneutes Anstoßen bei Fehlern.
- PIN und Passwörter mit scrypt, serverseitige Sitzungen, CSRF-/Origin-Prüfung, Rate-Limits, CSP und kurzlebige Linkberechtigungen. Tokens werden als SHA-256-Hash gespeichert; versandfertige Linkdaten in der Warteschlange sind mit AES-256-GCM verschlüsselt.
- Automatischer Ablauf überholter Anfragen, Abschluss vergangener Buchungen und Löschung gemäß Aufbewahrungsfrist.

Die vollständige Anforderungsspezifikation liegt unter [docs/specification.md](docs/specification.md). Anpassbare Mailvorlagen, Erinnerungen, Serienbuchungen und der Import externer Google-Termine sind spätere Erweiterungen.

## Plesk mit Node.js – ohne SSH und ohne CLI

Die Einrichtung benötigt nur die Plesk-Oberfläche und anschließend den Browser. Es gibt keinen separaten Build-Schritt, keine manuell auszuführenden Migrationen und keinen Befehl zum Erzeugen des Anwendungsschlüssels.

1. **Website vorbereiten:** Domain oder Subdomain in Plesk anlegen und ein gültiges SSL-Zertifikat aktivieren. Unter „Hosting-Einstellungen“ HTTP auf HTTPS umleiten.
2. **Dateien bereitstellen:** Über die Plesk-Git-Erweiterung dieses Repository in einen Anwendungsordner bereitstellen, beispielsweise `booking-app`. Alternativ das Repository als ZIP herunterladen und über den Plesk-Dateimanager hochladen und entpacken. Der Ordner muss `package.json`, `app.cjs`, `src` und `public` enthalten.
3. **Datenbank anlegen:** In Plesk unter **Datenbanken → Datenbank hinzufügen** eine neue leere MariaDB-/MySQL-Datenbank und einen zugeordneten Benutzer mit Zugriff auf diese Datenbank erstellen. Datenbankname, Benutzer und Passwort merken. Die Anwendung benötigt Rechte für Tabellenanlage, Indizes, Fremdschlüssel und Datenänderungen innerhalb dieser Datenbank, aber keine globalen Administratorrechte.
4. **Node.js einstellen:** In Plesk den Bereich **Node.js** öffnen und diese Werte setzen:

   | Einstellung                              | Wert                 |
   | ---------------------------------------- | -------------------- |
   | Node.js-Version                          | **24 LTS**           |
   | Anwendungsmodus                          | **Production**       |
   | Anwendungsverzeichnis / Application Root | `booking-app`        |
   | Dokumentenstamm / Document Root          | `booking-app/public` |
   | Startdatei / Application Startup File    | **`app.cjs`**        |

5. **Einrichtung schützen:** Unter **Benutzerdefinierte Umgebungsvariablen** `SETUP_TOKEN` auf einen selbst gewählten, privaten Code mit mindestens 16 Zeichen setzen. `APP_KEY`, `INITIAL_PIN` und die Admin-Zugangsdaten für den Assistenten **nicht** als Variablen anlegen. Optional `APP_DATA_DIR` auf ein dauerhaftes, für den Domainbenutzer beschreibbares Verzeichnis **außerhalb von `public`** setzen. Ohne diese Variable wird `booking-app/data` verwendet.
6. **Starten:** In Plesk **NPM installieren / NPM Install** anklicken, dann **App neu starten / Restart App**. Keine „Run Script“-Befehle erforderlich.
7. **Im Browser einrichten:** Die HTTPS-Adresse der Website öffnen. Einrichtungscode eingeben, MariaDB/MySQL auswählen und die Datenbankdaten aus Plesk eintragen. Auf demselben Server ist der Host meist `127.0.0.1`, Port `3306`. Falls Plesk einen anderen Datenbankserver nennt, diesen verwenden. Website-PIN und Admin-Benutzer samt Passwort festlegen; SMTP kann direkt mit eingerichtet werden. Auf **„Verbindung prüfen & Einrichtung abschließen“** klicken.
8. **Fahrzeuge anlegen:** Nach dem automatischen Wechsel zur normalen Website mit der neuen PIN öffnen. In **Verwaltung** anmelden, Freigabepersonen und Fahrzeuge anlegen. SMTP über **Betrieb & Einstellungen** testen. Nach erfolgreicher Einrichtung kann `SETUP_TOKEN` aus den Plesk-Variablen entfernt werden; der Assistent ist unabhängig davon gesperrt.

Der Assistent prüft die Verbindung, legt Tabellen und Administrator an und erzeugt den Anwendungsschlüssel automatisch. Neustarts lesen die gespeicherte Konfiguration wieder ein. Datenbankzugang, SMTP-Einstellungen und Schlüssel liegen in `data/runtime.json` (bzw. unter `APP_DATA_DIR`) mit restriktiven Dateirechten. PIN, Admin-Passwort und Einrichtungscode stehen **nicht** in dieser Datei. Der öffentliche Dokumentenstamm darf ausschließlich `public` sein.

**Updates:** In Plesk Git die Änderungen abrufen/bereitstellen, bei geänderten Abhängigkeiten auf **NPM installieren** klicken und **App neu starten**. Neue Datenbankmigrationen laufen automatisch beim Start. `data/runtime.json` und die Datenbank bei Deployments erhalten. Der Assistent wird bei Updates nicht erneut geöffnet.

**Backups ohne CLI:** MariaDB/MySQL über **Plesk → Datenbanken → Dump exportieren** oder den **Backup-Manager** sichern. Zusätzlich über den Dateimanager `data/runtime.json` geschützt sichern; darin liegt der Schlüssel für noch ausstehende Mailaufgaben. Beim Wiederherstellen müssen Datenbank und Konfiguration zusammenpassen. Eine bereits gefüllte Datenbank wird vom Ersteinrichtungsassistenten nicht übernommen oder zurückgesetzt.

**Verbindungsdaten ändern:** Bestehende Werte können in Plesk über `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `SMTP_HOST` usw. überschrieben werden. Danach **App neu starten**. Keine Dateibearbeitung oder CLI erforderlich. Der Wechsel von SQLite auf MariaDB verbindet eine andere Datenbank und überträgt vorhandene Buchungen nicht automatisch; für bestehende Daten vor einem Wechsel eine Datenübernahme planen.

**Proxy:** Der Assistent verwendet standardmäßig einen vertrauenswürdigen Plesk-Proxy (`TRUST_PROXY=1`) und verlangt im Produktionsmodus HTTPS. Bei zusätzlichen CDN-/Proxy-Schichten die tatsächliche Vertrauenskette passend konfigurieren. Der direkte Node-Port soll nicht öffentlich erreichbar sein. Der CommonJS-Startpunkt ist lokal getestet; eine konkrete Plesk-Installation muss ihre Node.js-/Passenger-Unterstützung und passende Schreibrechte bereitstellen.

## Lokal starten (Entwicklung, optional)

Voraussetzung: **Node.js 24 LTS**. Die eingebaute SQLite-Unterstützung erspart native Datenbank-Abhängigkeiten. Ein einzelner Anwendungsserver mit lokalem persistentem Datenträger genügt; die SQLite-Datei darf nicht auf einem Netzwerkdateisystem oder zwischen mehreren Hosts geteilt werden.

```sh
npm ci --ignore-scripts
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Den erzeugten Wert als `APP_KEY` eintragen. Zusätzlich `INITIAL_PIN` (genau vier Ziffern), `ADMIN_USERNAME` und `ADMIN_PASSWORD` (mindestens zwölf Zeichen) setzen. Es gibt keine Standardzugänge oder automatisch angelegten Fahrzeuge. Mit `npm start` starten und `http://localhost:3000` öffnen.

Beim ersten Start werden Datenbank und Administrator angelegt. Danach gelten die gespeicherten Zugangsdaten; Änderungen erfolgen in der Verwaltung. Die Bootstrap-Werte können nach dem ersten erfolgreichen Start aus der Umgebung entfernt werden. `APP_KEY` dauerhaft sichern und bei jedem Neustart unverändert beibehalten.

1. Mit der PIN öffnen, dann unter **Verwaltung** mit dem Adminzugang anmelden.
2. Freigabepersonen mit ihren E-Mail-Adressen anlegen.
3. Fahrzeuge mit Freigabegruppe und Freigaberegel anlegen.
4. SMTP und gegebenenfalls Google konfigurieren und über **Betrieb & Einstellungen** testen.
5. Eine vollständige Testanfrage inklusive E-Mail-Bestätigung und Freigabe durchführen.

Ohne SMTP bleiben Anfragen gespeichert, aber die Bestätigungs- und Freigabelinks können nicht zugestellt werden. Die Anwendung stellt diese Links aus Sicherheitsgründen nicht öffentlich oder in Logs bereit.

## Konfiguration

Für den Plesk-Assistenten genügt zunächst `SETUP_TOKEN` (mindestens 16 Zeichen). Dieser erzeugt und speichert alle Pflichtwerte. Die folgenden Variablen sind nur für direkte Konfiguration bzw. spätere Überschreibungen nötig:

| Zusätzliche Variable                | Bedeutung                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `SETUP_TOKEN`                       | Einmaliger Einrichtungscode, nur vor Erstinstallation benötigt                           |
| `APP_DATA_DIR`                      | Dauerhaftes Datenverzeichnis außerhalb von `public`; Standard `./data`                   |
| `DB_CLIENT`                         | `mariadb` oder `mysql`; ohne Angabe bleibt SQLite für bestehende Installationen erhalten |
| `DB_HOST`, `DB_PORT`                | SQL-Server; Standard `127.0.0.1:3306`                                                    |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Bereits in Plesk angelegte Datenbank und zugeordneter Benutzer                           |
| `DB_SSL`                            | `true` für TLS mit gültiger Server-Zertifikatskette bei externem Datenbankserver         |
| `DB_SOCKET`                         | Optionaler lokaler Unix-Socket statt TCP                                                 |

MariaDB **10.6+** und MySQL **8.0.16+** werden unterstützt. Der MariaDB-Connector enthält keine zu kompilierenden nativen Datenbankmodule. Jeder App-Prozess nutzt eine Verbindung in einem Worker; die bestehende synchrone Transaktionsgrenze wird für beide Datenbanken beibehalten. Das ist für die geringe gleichzeitige Last einer Feuerwehrbuchung ausgelegt. Bei MariaDB/MySQL schützt eine verbindungsgebundene Sperre vor parallelen finalen Freigaben.

| Variable                                          | Bedeutung                                                                           |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `APP_KEY`                                         | 64 Hex-Zeichen; Verschlüsselung der Warteschlange, unbedingt separat sichern        |
| `NODE_ENV`                                        | Lokal `development`, produktiv `production`                                         |
| `BASE_URL`                                        | Externe URL, produktiv zwingend `https://…`; Grundlage für Links und Origin-Prüfung |
| `HOST`, `PORT`                                    | Standard `127.0.0.1:3000`; Docker setzt `0.0.0.0:3000`                              |
| `TRUST_PROXY`                                     | `1` bei genau einem vertrauenswürdigen vorgeschalteten Proxy; sonst `0`             |
| `DATABASE_PATH`                                   | Standard `./data/booking.sqlite`                                                    |
| `INITIAL_PIN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Nur zum Anlegen des ersten Zugangs                                                  |
| `SITE_NAME`                                       | Initialer Anzeigename, später in der Verwaltung änderbar                            |
| `RETENTION_DAYS`                                  | Aufbewahrung nach Buchungsende; Standard 365, Minimum 30 Tage                       |
| `SMTP_HOST`, `SMTP_PORT`                          | SMTP-Server; Standardport 587                                                       |
| `SMTP_SECURE`                                     | `false`: STARTTLS verpflichtend; `true`: implizites TLS, meist Port 465             |
| `SMTP_USER`, `SMTP_PASSWORD`                      | SMTP-Anmeldedaten                                                                   |
| `SMTP_FROM`, `SMTP_FROM_NAME`                     | Absenderadresse und Anzeigename                                                     |
| `GOOGLE_CLIENT_EMAIL`                             | E-Mail des Google Service Accounts                                                  |
| `GOOGLE_PRIVATE_KEY`                              | Privater PEM-Schlüssel; in `.env` in Anführungszeichen mit `\n`-Zeichen             |

Die Adresse im Browser muss zu `BASE_URL` passen (auch `localhost` und `127.0.0.1` sind unterschiedliche Origins). Verbindungsgeheimnisse kommen aus dem geschützten Einrichtungsassistenten oder der Serverumgebung und niemals ins Repository. Nicht leere Umgebungsvariablen haben Vorrang vor `runtime.json`. `.env` und der Ordner `data` dürfen nicht über den Webserver ausgeliefert werden.

## Docker

`.env` konfigurieren, insbesondere `APP_KEY`, Bootstrap-Zugang, SMTP und eine externe HTTPS-`BASE_URL`.

```sh
mkdir -p backups
# Linux: make the host backup directory writable for the container user (UID 1000).
sudo chown 1000:1000 backups
docker compose up -d --build
docker compose logs -f booking
```

Compose veröffentlicht nur `127.0.0.1:3000`. Ein lokaler Nginx-, Caddy- oder Plesk-Proxy übernimmt TLS. Bei einem Proxy in einem anderen Container statt des Host-Ports ein privates Docker-Netz verwenden und die Zahl der Proxy-Hops entsprechend setzen. Container läuft als Benutzer `node` ohne zusätzliche Linux-Capabilities; Root-Dateisystem ist schreibgeschützt. Die Datenbank liegt im persistenten Volume `booking-data`.

Nginx-Beispiel innerhalb eines bereits mit TLS konfigurierten Hosts:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
}
```

`/healthz` prüft den Datenbankzugriff. Der Docker-Healthcheck verwendet den vertrauenswürdigen lokalen Proxy-Header. Bei Betrieb ohne Proxy muss ein TLS-fähiger Reverse Proxy ergänzt werden; der Node-Prozess stellt selbst kein TLS bereit.

## Google Kalender

1. Google Cloud-Projekt mit aktivierter Calendar API anlegen.
2. Service Account und Schlüssel erstellen; E-Mail und privaten Schlüssel über die Umgebung bereitstellen. Schlüsseldateien niemals einchecken.
3. Einen **privaten** Kalender erstellen und für die Service-Account-Adresse mit „Termine ändern“ freigeben. Der Service Account braucht keinen Zugriff auf andere Kalender.
4. Die Kalender-ID aus den Kalendereinstellungen im jeweiligen Fahrzeug hinterlegen. Mehrere Fahrzeuge dürfen denselben Kalender verwenden.
5. Verbindungstest in der Verwaltung ausführen. Dieser prüft die Lesbarkeit; Schreibrechte anschließend mit einer genehmigten Testbuchung prüfen.

Erst nach vollständiger Genehmigung wird je Fahrzeug ein Eintrag geschrieben. Eindeutige Event-IDs und gespeicherte Synchronisierungszustände verhindern Duplikate bei Wiederholungen. Änderungen entfernen die bisherige Reservierung bis zur erneuten Freigabe. Stornierungen entfernen die Einträge. Historische abgeschlossene Buchungen bleiben bis zur Löschung als vergangene Termine bestehen.

Die eigene Datenbank ist führend. Extern angelegte Google-Termine verhindern keine Buchung. Ein öffentlicher Google-Kalender kann Namen trotz PIN-Schutz der Website nach außen sichtbar machen; private Kalender sind daher der vorgesehene Betrieb.

## Betrieb, Migrationen und Backups

SQLite-Migrationen aus `migrations/` werden transaktional angewendet. MariaDB/MySQL verwendet `migrations/mariadb/`; dort laufen wiederholbar sichere DDL-Schritte unter einer Datenbanksperre, weil MySQL-DDL automatisch committet. Beide Varianten laufen beim Start automatisch. Bereits angewendete Migrationen werden nicht erneut ausgeführt oder nachträglich verändert. `npm run migrate` führt sie separat aus. Vor Updates immer ein Backup erstellen.

```sh
npm run backup
# Docker, Backup wird auf den Host unter ./backups geschrieben:
docker compose exec booking node scripts/backup.js
```

Das Backup verwendet die SQLite-Backup-API und ist auch im laufenden Betrieb konsistent. Für MariaDB/MySQL den Plesk-Datenbankexport verwenden; `npm run backup` ist ausschließlich für SQLite vorgesehen. Zusätzlich `APP_KEY` und die restliche Umgebung getrennt und geschützt sichern. Ohne denselben Schlüssel sind noch nicht zugestellte Warteschlangen-Einträge nicht lesbar. Backups enthalten personenbezogene Daten und müssen geschützt aufbewahrt und nach eigener Frist gelöscht werden.

Wiederherstellung: Anwendung anhalten, vorhandene Datenbank inklusive WAL-/SHM-Dateien **als Sicherung in einen anderen Ordner verschieben**, gewähltes Backup an `DATABASE_PATH` wiederherstellen und Besitz-/Zugriffsrechte prüfen. Danach mit derselben Umgebung starten und Kalender-/Mailwarteschlange kontrollieren. Ein Restore kann bereits zugestellte Mails erneut auslösen; Kalendereinträge werden anhand stabiler IDs abgeglichen.

Einzelne Hintergrundaufgaben werden nach Fehlern mit wachsendem Abstand automatisch bis zu acht Mal versucht (maximal sechs Stunden Abstand). Danach in der Verwaltung Konfiguration korrigieren und erneut anstoßen. Erfolgreich versendete Mailinhalte werden aus der Warteschlange entfernt. Nicht abgeschlossene Kalenderaufgaben verhindern die Löschung der zugehörigen Buchung.

Bestätigungslinks gelten 24 Stunden, Freigabelinks höchstens sieben Tage und maximal bis zum Buchungsbeginn, Verwaltungslinks bis 30 Tage nach Ende (mindestens sieben Tage). Ein GET-Aufruf löst niemals eine Entscheidung aus. Die vierstellige PIN wird zusätzlich für persönliche Links verlangt. Freigabepersonen mit abgelaufenen Links benötigen eine neu angefragte Freigabe über die Verwaltung; es gibt keinen geheimen Admin-Bypass.

Eine deaktivierte Freigabeperson verliert ihre Tokenberechtigung. Bereits offene Anfragen behalten ihr ursprüngliches Quorum: bei unvollständig erreichbarer Gruppe die Buchung in der Verwaltung ändern und neu anfragen. Archivierte Fahrzeuge und historische Buchungen werden nicht durch die Fahrzeugverwaltung gelöscht.

## Datenschutz und Sicherheit

Der interne Kalender enthält ausschließlich Namen, Zweck, Zeitraum, Abteilung, Fahrzeugdaten und Status. E-Mail-Adressen und Bemerkungen sind auf persönliche Verwaltungs-/Freigabeansichten und den Adminbereich beschränkt. Persönliche Links sind Bearer-Berechtigungen: nicht weitergeben. Links verwenden URL-Fragmente; sie werden nicht an den HTTP-Server oder als Referrer übertragen. Es gibt keine externen Schriftarten, Tracker oder Analytics.

Aufbewahrung: Standardmäßig werden Buchungsdaten und zugehörige Tokens/Entscheidungen nach 365 Tagen ab Buchungsende gelöscht; `RETENTION_DAYS` passt die Frist an. Das Änderungsprotokoll wird nach derselben Frist bereinigt. Vergangene Google-Termine bleiben als Kalenderhistorie bestehen; deren Aufbewahrung und Löschung sowie Webserver-Logs und Backups müssen gesondert geregelt werden. Fahrzeugbilder können optional von externen HTTPS-Adressen geladen werden.

Sitzungen sind zwölf Stunden gültig. Cookies sind `HttpOnly`, `SameSite=Strict` und produktiv `Secure` mit `__Host-`-Präfix. PIN- und Loginversuche sind auf fünf Versuche pro IP in 15 Minuten begrenzt. Einstellungen, Entscheidungen und relevante Änderungen werden protokolliert; Passwörter, PINs und Tokens erscheinen nicht im Änderungsprotokoll.

## Qualität und Updates

```sh
npm test
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Die Tests decken Freigabequoren, Ablehnungen, Mehrfachbuchungen, atomare parallele Genehmigungen mit getrennten Datenbankverbindungen, Konflikte und Sperren, exklusive Intervallgrenzen, Sommer-/Winterzeit, persönliche Tokens, CSRF/PIN/Adminrechte, Datensparsamkeit, SMTP-Fehler und idempotente Google-Synchronisierung ab. Externe Dienste sind in automatischen Tests simuliert; reale SMTP- und Google-Zugangsdaten werden nicht für CI benötigt.

GitHub Actions prüft zusätzlich echte MariaDB- und MySQL-Datenbanken sowie die gesicherte Browser-Einrichtung und prüft auf Linux und Windows, Syntax, Tests, Build, `npm audit` und den Docker-Build. Der Build ist eine Syntax-/Auslieferungsprüfung; das Frontend ist bewusst ohne Bundler nutzbar. Dependabot erstellt tägliche npm-Updates und wöchentliche Docker-/Actions-Updates. Patch und Minor werden gruppiert; Major-Updates bleiben gesonderte PRs. Automatisches Merge und Produktivdeployment sind nicht aktiviert. Sicherheitsmeldungen zusätzlich in den Repository-Einstellungen aktivieren, falls noch nicht aktiv.

Vor einem produktiven Einsatz: echte SMTP-Zustellung, Google-Schreibrechte und das Zieldeployment prüfen und die initialen Zugangsdaten selbst wählen.
