-- ============================================================
-- RooME — Seed Data (PostgreSQL)
-- Passwords are bcrypt hash of "password123" (cost 10)
-- Run AFTER migrate.sql
-- ============================================================

-- Demo users
INSERT INTO users (name, email, password, role) VALUES
  ('Demo Student', 'student@roome.ph', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHi6', 'student'),
  ('Demo Owner',   'owner@roome.ph',   '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHi6', 'owner');

-- Demo dorms (owner_id = 2)
INSERT INTO dorms (owner_id, name, description, price, lat, lng, status, amenities, image_url, address)
VALUES
  (2, 'Campus Heights',
   'Modern dorm with stunning views, just 0.8km from PUP.',
   4000, 14.6015, 120.9830, 'available',
   '["WiFi","Parking"]',
   'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=600&auto=format&fit=crop',
   'P. Campa St, Santa Mesa, Manila'),

  (2, 'The Cozy Place',
   'Quiet and cozy studio-type rooms with full kitchen access.',
   3500, 14.5980, 120.9860, 'full',
   '["AC","Kitchen"]',
   'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?q=80&w=600&auto=format&fit=crop',
   'Nagtahan St, Santa Mesa, Manila'),

  (2, 'Student Haven',
   'Budget-friendly rooms with all essential amenities included.',
   2000, 14.6020, 120.9855, 'available',
   '["WiFi","AC","Kitchen"]',
   'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?q=80&w=600&auto=format&fit=crop',
   'Lerma St, Santa Mesa, Manila');
