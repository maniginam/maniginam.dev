-- Seed data for the WBR portal demo. Realistic Port Allen content.
-- Staff passwords are PBKDF2(pw, salt as utf8, 100000, sha256, 32B) — all "wbr2026".

INSERT OR IGNORE INTO staff_users (username, name, role, pw_hash, pw_salt, created_at) VALUES
 ('brady',       'Brady Hotard (District IV)', 'admin',       '57d218fb90966dd6cb078342d3849587610a84e9b61007bdafccbf111a794edd', 'dc4b2c1a14e1adf68aa7a5f2bb12e49b', '2026-07-01T09:00:00Z'),
 ('clerk',       'Council Clerk',              'clerk',       'fc3694399dc4ab33b083b00fa11340b25fe4e55f99a96da475530e70b439d73b', '89d118ba175e6a3a03f9759a7bc16ede', '2026-07-01T09:00:00Z'),
 ('publicworks', 'Public Works Dispatch',      'publicworks', '85810bb85f29918ab69cab9119f369d78f2d67c79fcc8fe46de19776d96d4fd4', 'c2be205e8063546d030ecdb8182b9bb0', '2026-07-01T09:00:00Z');

INSERT OR IGNORE INTO issues
 (id, category, title, description, address, lat, lng, status, reporter_name, reporter_contact, source, created_at, updated_at) VALUES
 ('WBR-24817','pothole', 'Large pothole on N Jefferson Ave', 'Deep pothole near the courthouse, hazard to cars.', 'N Jefferson Ave & Court St, Port Allen', 30.4519, -91.2101, 'new',  'A. Resident', '', 'app', '2026-07-08T07:10:00Z','2026-07-08T07:10:00Z'),
 ('WBR-24815','drainage','Standing water blocking Rosedale Rd','Water across both lanes after last night''s rain.','Rosedale Rd near Lobdell, Port Allen', 30.4402, -91.2255, 'prog', 'M. Guidry', '', 'app', '2026-07-08T04:20:00Z','2026-07-08T12:00:00Z'),
 ('WBR-24810','light',   'Street light out for 3 nights', 'Whole corner is dark, safety concern.', '6th St & Louisiana Ave, Port Allen', 30.4471, -91.2032, 'new',  'T. Landry', '', 'web', '2026-07-07T21:00:00Z','2026-07-07T21:00:00Z'),
 ('WBR-24802','debris',  'Illegal dumping behind ballpark', 'Someone dumped construction debris on the access road.', 'Cohn Park access road, Port Allen', 30.4550, -91.1985, 'prog', 'Public Works', '', 'staff','2026-07-06T15:30:00Z','2026-07-07T09:00:00Z'),
 ('WBR-24788','water',   'Water main leak at curb', 'Water bubbling up at the curb for two days.', 'Alexander Ave, Port Allen', 30.4488, -91.2110, 'done', 'B. Comeaux', '', 'app', '2026-07-04T08:00:00Z','2026-07-05T16:00:00Z'),
 ('WBR-24771','sign',    'Stop sign knocked down', 'Stop sign flat on the ground after a wreck.', 'LA-1 & Court St, Port Allen', 30.4460, -91.2075, 'done', 'LADOTD', '', 'staff','2026-07-02T10:00:00Z','2026-07-03T14:00:00Z');

INSERT INTO issue_events (issue_id, kind, detail, actor, created_at) VALUES
 ('WBR-24817','created','Request submitted via mobile app','resident','2026-07-08T07:10:00Z'),
 ('WBR-24815','created','Request submitted via mobile app','resident','2026-07-08T04:20:00Z'),
 ('WBR-24815','status','Marked in progress — crew dispatched','publicworks','2026-07-08T12:00:00Z'),
 ('WBR-24788','created','Request submitted via mobile app','resident','2026-07-04T08:00:00Z'),
 ('WBR-24788','status','Resolved — main repaired','publicworks','2026-07-05T16:00:00Z');

INSERT OR IGNORE INTO alert_subscribers (email, name, district, channels, verified, created_at) VALUES
 ('resident1@example.com','A. Resident','IV','email',1,'2026-06-01T09:00:00Z'),
 ('resident2@example.com','M. Guidry','II','email',1,'2026-06-02T09:00:00Z'),
 ('resident3@example.com','T. Landry','VI','email',1,'2026-06-03T09:00:00Z');
