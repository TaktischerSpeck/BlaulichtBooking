CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE admins (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, pin INTEGER NOT NULL DEFAULT 0, admin_id INTEGER REFERENCES admins(id), expires INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE approvers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE vehicles (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, callsign TEXT NOT NULL DEFAULT '', plate TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', seats INTEGER, image TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#2563eb',
 active INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, sort_order INTEGER NOT NULL DEFAULT 0,
 rule TEXT NOT NULL DEFAULT 'any' CHECK(rule IN ('any','all','quorum')), quorum INTEGER NOT NULL DEFAULT 1, calendar_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE vehicle_approvers (vehicle_id TEXT REFERENCES vehicles(id), approver_id TEXT REFERENCES approvers(id), PRIMARY KEY(vehicle_id,approver_id));
CREATE TABLE bookings (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, purpose TEXT NOT NULL, department TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 start INTEGER NOT NULL, end INTEGER NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL CHECK(status IN ('unverified','pending','approved','rejected','cancelled','expired','completed')),
 revision INTEGER NOT NULL DEFAULT 1, manual INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL,
 CHECK(end > start)
);
CREATE TABLE reservations (
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
 rule TEXT NOT NULL, required INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
 PRIMARY KEY(booking_id,vehicle_id)
);
CREATE TABLE eligible (
 booking_id TEXT NOT NULL, vehicle_id TEXT NOT NULL, approver_id TEXT NOT NULL REFERENCES approvers(id),
 PRIMARY KEY(booking_id,vehicle_id,approver_id),
 FOREIGN KEY(booking_id,vehicle_id) REFERENCES reservations(booking_id,vehicle_id) ON DELETE CASCADE
);
CREATE TABLE decisions (
 booking_id TEXT NOT NULL, vehicle_id TEXT NOT NULL, approver_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
 reason TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL,
 PRIMARY KEY(booking_id,vehicle_id,approver_id),
 FOREIGN KEY(booking_id,vehicle_id,approver_id) REFERENCES eligible(booking_id,vehicle_id,approver_id) ON DELETE CASCADE
);
CREATE TABLE tokens (
 hash TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('verify','manage','approve')), approver_id TEXT REFERENCES approvers(id),
 revision INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE blocks (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id), start INTEGER NOT NULL, end INTEGER NOT NULL, reason TEXT NOT NULL, CHECK(end > start));
CREATE TABLE calendar_events (
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
 calendar_id TEXT NOT NULL, event_id TEXT NOT NULL, synced_revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', error TEXT,
 PRIMARY KEY(booking_id,vehicle_id,calendar_id)
);
CREATE TABLE jobs (
 id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('mail','calendar')), booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
 payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', error TEXT, created INTEGER NOT NULL
);
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, booking_id TEXT, detail TEXT NOT NULL);
CREATE INDEX booking_period ON bookings(start,end,status);
CREATE INDEX tokens_booking ON tokens(booking_id);
CREATE INDEX jobs_due ON jobs(status,next_at);
CREATE INDEX session_expiry ON sessions(expires);
CREATE INDEX audit_booking ON audit(booking_id,created);
