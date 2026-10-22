CREATE TABLE IF NOT EXISTS settings (`key` VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS admins (id INT PRIMARY KEY AUTO_INCREMENT, username VARCHAR(254) NOT NULL UNIQUE, password_hash VARCHAR(256) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS sessions (hash VARCHAR(64) PRIMARY KEY, csrf VARCHAR(64) NOT NULL, pin INT NOT NULL DEFAULT 0, admin_id INT, expires BIGINT NOT NULL, FOREIGN KEY(admin_id) REFERENCES admins(id), INDEX session_expiry(expires)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS rate_limits (`key` VARCHAR(64) PRIMARY KEY, count INT NOT NULL, reset_at BIGINT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS approvers (id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, active INT NOT NULL DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS vehicles (
 id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, callsign VARCHAR(100) NOT NULL DEFAULT '', plate VARCHAR(30) NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT (''), seats INT, image VARCHAR(1000) NOT NULL DEFAULT '', color VARCHAR(7) NOT NULL DEFAULT '#2563eb',
 active INT NOT NULL DEFAULT 1, archived INT NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0,
 rule VARCHAR(20) NOT NULL DEFAULT 'any' CHECK(rule IN ('any','all','quorum')), quorum INT NOT NULL DEFAULT 1, calendar_id VARCHAR(300) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS vehicle_approvers (vehicle_id VARCHAR(64), approver_id VARCHAR(64), PRIMARY KEY(vehicle_id,approver_id), FOREIGN KEY(vehicle_id) REFERENCES vehicles(id), FOREIGN KEY(approver_id) REFERENCES approvers(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS bookings (
 id VARCHAR(64) PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(254) NOT NULL, purpose VARCHAR(300) NOT NULL, department VARCHAR(100) NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT (''),
 start BIGINT NOT NULL, `end` BIGINT NOT NULL, all_day INT NOT NULL DEFAULT 0,
 status VARCHAR(20) NOT NULL CHECK(status IN ('unverified','pending','approved','rejected','cancelled','expired','completed')),
 revision INT NOT NULL DEFAULT 1, manual INT NOT NULL DEFAULT 0, created BIGINT NOT NULL, updated BIGINT NOT NULL,
 CHECK(`end` > start), INDEX booking_period(start,`end`,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS reservations (
 booking_id VARCHAR(64) NOT NULL, vehicle_id VARCHAR(64) NOT NULL,
 rule VARCHAR(20) NOT NULL, required INT NOT NULL, state VARCHAR(20) NOT NULL DEFAULT 'pending',
 PRIMARY KEY(booking_id,vehicle_id), FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE, FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS eligible (
 booking_id VARCHAR(64) NOT NULL, vehicle_id VARCHAR(64) NOT NULL, approver_id VARCHAR(64) NOT NULL,
 PRIMARY KEY(booking_id,vehicle_id,approver_id), FOREIGN KEY(approver_id) REFERENCES approvers(id),
 FOREIGN KEY(booking_id,vehicle_id) REFERENCES reservations(booking_id,vehicle_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS decisions (
 booking_id VARCHAR(64) NOT NULL, vehicle_id VARCHAR(64) NOT NULL, approver_id VARCHAR(64) NOT NULL, decision VARCHAR(20) NOT NULL CHECK(decision IN ('approve','reject')),
 reason TEXT NOT NULL DEFAULT (''), created BIGINT NOT NULL,
 PRIMARY KEY(booking_id,vehicle_id,approver_id),
 FOREIGN KEY(booking_id,vehicle_id,approver_id) REFERENCES eligible(booking_id,vehicle_id,approver_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS tokens (
 hash VARCHAR(64) PRIMARY KEY, booking_id VARCHAR(64) NOT NULL,
 kind VARCHAR(20) NOT NULL CHECK(kind IN ('verify','manage','approve')), approver_id VARCHAR(64),
 revision INT NOT NULL, expires BIGINT NOT NULL, used INT NOT NULL DEFAULT 0,
 FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE, FOREIGN KEY(approver_id) REFERENCES approvers(id), INDEX tokens_booking(booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS blocks (id VARCHAR(64) PRIMARY KEY, vehicle_id VARCHAR(64) NOT NULL, start BIGINT NOT NULL, `end` BIGINT NOT NULL, reason VARCHAR(300) NOT NULL, CHECK(`end` > start), FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS calendar_events (
 booking_id VARCHAR(64) NOT NULL, vehicle_id VARCHAR(64) NOT NULL,
 calendar_id VARCHAR(300) NOT NULL, event_id VARCHAR(64) NOT NULL, synced_revision INT NOT NULL DEFAULT 0, status VARCHAR(20) NOT NULL DEFAULT 'pending', error TEXT,
 PRIMARY KEY(booking_id,vehicle_id,calendar_id), FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE, FOREIGN KEY(vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS jobs (
 id VARCHAR(64) PRIMARY KEY, type VARCHAR(20) NOT NULL CHECK(type IN ('mail','calendar')), booking_id VARCHAR(64),
 payload LONGTEXT NOT NULL, attempts INT NOT NULL DEFAULT 0, next_at BIGINT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', error TEXT, created BIGINT NOT NULL,
 FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE, INDEX jobs_due(status,next_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS audit (id BIGINT PRIMARY KEY AUTO_INCREMENT, created BIGINT NOT NULL, actor VARCHAR(100) NOT NULL, action VARCHAR(100) NOT NULL, booking_id VARCHAR(64), detail LONGTEXT NOT NULL, INDEX audit_booking(booking_id,created)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
