-- Insert Central Admin
INSERT INTO users (
    id, username, email, password, role, district, 
    first_name, last_name, is_blocked, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'central_admin',
    'central.admin@punjab.gov.in',
    '$2b$10$[bcrypt_hash_of_Punjab@2024]', -- Password: Punjab@2024
    'central_admin',
    NULL,
    'Central',
    'Administrator',
    false,
    NOW(),
    NOW()
);

-- Insert District Admins
INSERT INTO users (
    id, username, email, password, role, district, 
    first_name, last_name, is_blocked, created_at, updated_at
) VALUES 
    (gen_random_uuid(), 'amritsar_admin', 'admin.amritsar@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Amritsar@2024]', 'district_admin', 'Amritsar', 'Amritsar', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'barnala_admin', 'admin.barnala@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Barnala@2024]', 'district_admin', 'Barnala', 'Barnala', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'bathinda_admin', 'admin.bathinda@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Bathinda@2024]', 'district_admin', 'Bathinda', 'Bathinda', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'faridkot_admin', 'admin.faridkot@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Faridkot@2024]', 'district_admin', 'Faridkot', 'Faridkot', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'fatehgarh_sahib_admin', 'admin.fatehgarh@punjab.gov.in', '$2b$10$[bcrypt_hash_of_FatehgarhSahib@2024]', 'district_admin', 'Fatehgarh Sahib', 'Fatehgarh Sahib', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'fazilka_admin', 'admin.fazilka@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Fazilka@2024]', 'district_admin', 'Fazilka', 'Fazilka', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'ferozepur_admin', 'admin.ferozepur@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Ferozepur@2024]', 'district_admin', 'Ferozepur', 'Ferozepur', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'gurdaspur_admin', 'admin.gurdaspur@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Gurdaspur@2024]', 'district_admin', 'Gurdaspur', 'Gurdaspur', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'hoshiarpur_admin', 'admin.hoshiarpur@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Hoshiarpur@2024]', 'district_admin', 'Hoshiarpur', 'Hoshiarpur', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'jalandhar_admin', 'admin.jalandhar@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Jalandhar@2024]', 'district_admin', 'Jalandhar', 'Jalandhar', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'kapurthala_admin', 'admin.kapurthala@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Kapurthala@2024]', 'district_admin', 'Kapurthala', 'Kapurthala', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'ludhiana_admin', 'admin.ludhiana@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Ludhiana@2024]', 'district_admin', 'Ludhiana', 'Ludhiana', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'mansa_admin', 'admin.mansa@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Mansa@2024]', 'district_admin', 'Mansa', 'Mansa', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'moga_admin', 'admin.moga@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Moga@2024]', 'district_admin', 'Moga', 'Moga', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'muktsar_admin', 'admin.muktsar@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Muktsar@2024]', 'district_admin', 'Muktsar', 'Muktsar', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'nawanshahr_admin', 'admin.nawanshahr@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Nawanshahr@2024]', 'district_admin', 'Nawanshahr', 'Nawanshahr', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'pathankot_admin', 'admin.pathankot@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Pathankot@2024]', 'district_admin', 'Pathankot', 'Pathankot', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'patiala_admin', 'admin.patiala@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Patiala@2024]', 'district_admin', 'Patiala', 'Patiala', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'rupnagar_admin', 'admin.rupnagar@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Rupnagar@2024]', 'district_admin', 'Rupnagar', 'Rupnagar', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'sas_nagar_admin', 'admin.sasnagar@punjab.gov.in', '$2b$10$[bcrypt_hash_of_SASNagar@2024]', 'district_admin', 'SAS Nagar', 'SAS Nagar', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'sangrur_admin', 'admin.sangrur@punjab.gov.in', '$2b$10$[bcrypt_hash_of_Sangrur@2024]', 'district_admin', 'Sangrur', 'Sangrur', 'Admin', false, NOW(), NOW()),
    (gen_random_uuid(), 'tarn_taran_admin', 'admin.tarntaran@punjab.gov.in', '$2b$10$[bcrypt_hash_of_TarnTaran@2024]', 'district_admin', 'Tarn Taran', 'Tarn Taran', 'Admin', false, NOW(), NOW());