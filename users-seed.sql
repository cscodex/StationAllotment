-- Users for Punjab Seat Allotment System
-- Generated on 2025-09-14T10:39:27.241Z
-- This file contains INSERT statements for central admin and all 23 district admins

-- Note: Passwords are already bcrypt hashed with salt rounds = 10

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'DiqYOGCO3dm61M3CSD_1G',
  'central_admin',
  'central.admin@punjab.gov.in',
  '$2b$10$kwizqcqhRZfHIdXHx26i.OvvjaOvXGEZTJjOEFxyoLvE4l047MJdW',
  'central_admin',
  NULL,
  'Central',
  'Administrator',
  '{"username":"central_admin","email":"central.admin@punjab.gov.in","role":"central_admin","firstName":"Central","lastName":"Administrator"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'vRlz0Y3zy4Kp9tpWbrVil',
  'admin_amritsar',
  'admin.amritsar@punjab.gov.in',
  '$2b$10$l/t7wKj7Lv6gR3SeRP4cwePfru9zOrnbtPBKgBFnw53OzgVyIXOBO',
  'district_admin',
  'Amritsar',
  'Amritsar',
  'Admin',
  '{"username":"admin_amritsar","email":"admin.amritsar@punjab.gov.in","role":"district_admin","district":"Amritsar","firstName":"Amritsar","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'iCGs2eJGyQlnkeHSWcjvy',
  'admin_barnala',
  'admin.barnala@punjab.gov.in',
  '$2b$10$poNglQBakD.liFhk37lhO.W/o/gn/Ymc58T4kk.jjWbn2l0GcZKma',
  'district_admin',
  'Barnala',
  'Barnala',
  'Admin',
  '{"username":"admin_barnala","email":"admin.barnala@punjab.gov.in","role":"district_admin","district":"Barnala","firstName":"Barnala","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'Iuh47pDLnXa6Hb8er1Js9',
  'admin_bathinda',
  'admin.bathinda@punjab.gov.in',
  '$2b$10$jPBSL6E/lFVgROtLQkYKaeEfv2Az/.Ecqb6imjS0HZ0.gMbLrAedG',
  'district_admin',
  'Bathinda',
  'Bathinda',
  'Admin',
  '{"username":"admin_bathinda","email":"admin.bathinda@punjab.gov.in","role":"district_admin","district":"Bathinda","firstName":"Bathinda","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '-bTmYvVMUb2SKynnrOGCC',
  'admin_faridkot',
  'admin.faridkot@punjab.gov.in',
  '$2b$10$B0c35A.wsXLv8bHlwkdc5eKQ6vqKjJdDb7Mt78V0V/7D9YB6Pt.cq',
  'district_admin',
  'Faridkot',
  'Faridkot',
  'Admin',
  '{"username":"admin_faridkot","email":"admin.faridkot@punjab.gov.in","role":"district_admin","district":"Faridkot","firstName":"Faridkot","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '1z_RPXnZlwVtcR7NL0cNK',
  'admin_fatehgarh_sahib',
  'admin.fatehgarhsahib@punjab.gov.in',
  '$2b$10$mCEcIGl69SoMWdgZy4HAL.LX5Xeb1C8QadFiS52CupTf0k7u/y.pW',
  'district_admin',
  'Fatehgarh Sahib',
  'Fatehgarh Sahib',
  'Admin',
  '{"username":"admin_fatehgarh_sahib","email":"admin.fatehgarhsahib@punjab.gov.in","role":"district_admin","district":"Fatehgarh Sahib","firstName":"Fatehgarh Sahib","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'wfT-1xpB43ZS92b4OUmw6',
  'admin_fazilka',
  'admin.fazilka@punjab.gov.in',
  '$2b$10$MP3kOlYftrFBG.PJ5I.Kz.BVY4ZxvwB5dGROn0HF70LIXbUNjX.86',
  'district_admin',
  'Fazilka',
  'Fazilka',
  'Admin',
  '{"username":"admin_fazilka","email":"admin.fazilka@punjab.gov.in","role":"district_admin","district":"Fazilka","firstName":"Fazilka","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'q3mGA8_59BYw1xU-1Jtg4',
  'admin_ferozepur',
  'admin.ferozepur@punjab.gov.in',
  '$2b$10$Z0My9NvvcaAmErf7UzsvkuBeZhUk/ltTSbB5ITrO0YPri3msgu5WO',
  'district_admin',
  'Ferozepur',
  'Ferozepur',
  'Admin',
  '{"username":"admin_ferozepur","email":"admin.ferozepur@punjab.gov.in","role":"district_admin","district":"Ferozepur","firstName":"Ferozepur","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'G9ED8hQupO6uG7CVppb-z',
  'admin_gurdaspur',
  'admin.gurdaspur@punjab.gov.in',
  '$2b$10$PNV8oGQtx1ybhnFUs1TUYurl8SpWF3dQkT.h1pSSfHmNelXrqLMJS',
  'district_admin',
  'Gurdaspur',
  'Gurdaspur',
  'Admin',
  '{"username":"admin_gurdaspur","email":"admin.gurdaspur@punjab.gov.in","role":"district_admin","district":"Gurdaspur","firstName":"Gurdaspur","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '1J5d2p9T9QnQGV2YLHAfj',
  'admin_hoshiarpur',
  'admin.hoshiarpur@punjab.gov.in',
  '$2b$10$mO.yF.HiihSfLTYzfdxgf.tfekeP1HQfipX1Y4Qj67It8QKnP7XzW',
  'district_admin',
  'Hoshiarpur',
  'Hoshiarpur',
  'Admin',
  '{"username":"admin_hoshiarpur","email":"admin.hoshiarpur@punjab.gov.in","role":"district_admin","district":"Hoshiarpur","firstName":"Hoshiarpur","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'Dgo1rWGfA_inZy-fTSBhi',
  'admin_jalandhar',
  'admin.jalandhar@punjab.gov.in',
  '$2b$10$eoirR/iikE0nWkwGQ8uzT.cYdd0tPEb/wrsX1R4Ui4m/LtjTKRdGm',
  'district_admin',
  'Jalandhar',
  'Jalandhar',
  'Admin',
  '{"username":"admin_jalandhar","email":"admin.jalandhar@punjab.gov.in","role":"district_admin","district":"Jalandhar","firstName":"Jalandhar","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'tzQT-IYptvK3Wz5Tq2hur',
  'admin_kapurthala',
  'admin.kapurthala@punjab.gov.in',
  '$2b$10$LEk/P4QAqrmyQxl0TTzvqO0kFF1j8QAbvONkkVgoay7MYe4qDMV.e',
  'district_admin',
  'Kapurthala',
  'Kapurthala',
  'Admin',
  '{"username":"admin_kapurthala","email":"admin.kapurthala@punjab.gov.in","role":"district_admin","district":"Kapurthala","firstName":"Kapurthala","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'Enamv5-rC2ICoADdequgO',
  'admin_ludhiana',
  'admin.ludhiana@punjab.gov.in',
  '$2b$10$7vgF7XpmMWtc.esl0/dqrubc51SOkAnTfQ5PMHz23ihP3Q08ludJy',
  'district_admin',
  'Ludhiana',
  'Ludhiana',
  'Admin',
  '{"username":"admin_ludhiana","email":"admin.ludhiana@punjab.gov.in","role":"district_admin","district":"Ludhiana","firstName":"Ludhiana","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'FqJofPkDvp_57Eeqwn9XK',
  'admin_mansa',
  'admin.mansa@punjab.gov.in',
  '$2b$10$H6dl0ZBu4aw.UzUzBerav.kuCGpbujXw7m2g.srXTKJy5/QuEtDke',
  'district_admin',
  'Mansa',
  'Mansa',
  'Admin',
  '{"username":"admin_mansa","email":"admin.mansa@punjab.gov.in","role":"district_admin","district":"Mansa","firstName":"Mansa","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '465fY7R7K8OeohSnFFyDU',
  'admin_moga',
  'admin.moga@punjab.gov.in',
  '$2b$10$L7Ir6W4tbPCr/LrZkdzLTu5/KUUayZn5fqd5kTtlEMs5d2aAzoQR2',
  'district_admin',
  'Moga',
  'Moga',
  'Admin',
  '{"username":"admin_moga","email":"admin.moga@punjab.gov.in","role":"district_admin","district":"Moga","firstName":"Moga","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'gQd3tO0JagSTnJ12m_SAT',
  'admin_muktsar',
  'admin.muktsar@punjab.gov.in',
  '$2b$10$E8XVha3oFW9uE2NCIDdE..eX0zluKYAWnyMhlnbUWTFSNmJoviVXS',
  'district_admin',
  'Muktsar',
  'Muktsar',
  'Admin',
  '{"username":"admin_muktsar","email":"admin.muktsar@punjab.gov.in","role":"district_admin","district":"Muktsar","firstName":"Muktsar","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'rYUnonksd-OkLZsv2p-_d',
  'admin_nawanshahr',
  'admin.nawanshahr@punjab.gov.in',
  '$2b$10$zPotnFFEsoopkTEicLhj/.lHA6EGOqxhpCzstU1Bq7c3ei1Y.oEky',
  'district_admin',
  'Nawanshahr',
  'Nawanshahr',
  'Admin',
  '{"username":"admin_nawanshahr","email":"admin.nawanshahr@punjab.gov.in","role":"district_admin","district":"Nawanshahr","firstName":"Nawanshahr","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'YFYxrJZlT1WDMzUCmNxv9',
  'admin_pathankot',
  'admin.pathankot@punjab.gov.in',
  '$2b$10$n1eGiTuAZWJwTLeT9xkfCekgslERxFGtbhd.SfH/QfR2EWhwVpyVi',
  'district_admin',
  'Pathankot',
  'Pathankot',
  'Admin',
  '{"username":"admin_pathankot","email":"admin.pathankot@punjab.gov.in","role":"district_admin","district":"Pathankot","firstName":"Pathankot","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'IRNSxdOpyD2xsd1E2jKHR',
  'admin_patiala',
  'admin.patiala@punjab.gov.in',
  '$2b$10$93l2WCEUJjPfxUNSvFR8t.Tko5epsWgeOA8RXRgEhi8e95438raqi',
  'district_admin',
  'Patiala',
  'Patiala',
  'Admin',
  '{"username":"admin_patiala","email":"admin.patiala@punjab.gov.in","role":"district_admin","district":"Patiala","firstName":"Patiala","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'HtCCM6XSkqiUMUn2hsUZs',
  'admin_rupnagar',
  'admin.rupnagar@punjab.gov.in',
  '$2b$10$Lon6bo9ZCBivoBfsH6QlGuFM4MhARsnLb9swqmqpEomI98.eNCsMy',
  'district_admin',
  'Rupnagar',
  'Rupnagar',
  'Admin',
  '{"username":"admin_rupnagar","email":"admin.rupnagar@punjab.gov.in","role":"district_admin","district":"Rupnagar","firstName":"Rupnagar","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'OH_D_ELVflO43S0WqtEy3',
  'admin_sasnagar',
  'admin.sasnagar@punjab.gov.in',
  '$2b$10$ThuVY0kZAV9NlvxLYnqIGuTpjTxJwBfOSUPOxLaiYWjlD9NoK7T6.',
  'district_admin',
  'SAS Nagar',
  'SAS Nagar',
  'Admin',
  '{"username":"admin_sasnagar","email":"admin.sasnagar@punjab.gov.in","role":"district_admin","district":"SAS Nagar","firstName":"SAS Nagar","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  '9YAEO3QgzmF8ZTP_ULOvC',
  'admin_sangrur',
  'admin.sangrur@punjab.gov.in',
  '$2b$10$sqdA2oncDJWcIEITAssuF.3lbOY.sT1LVyBg2Gp0JVFMZ9fIGzL.W',
  'district_admin',
  'Sangrur',
  'Sangrur',
  'Admin',
  '{"username":"admin_sangrur","email":"admin.sangrur@punjab.gov.in","role":"district_admin","district":"Sangrur","firstName":"Sangrur","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'lzRmFY31R9rtwEXdo1ScW',
  'admin_tarn_taran',
  'admin.tarntaran@punjab.gov.in',
  '$2b$10$LCjFckcYKiLsHZe89aSMAOxZsqOgd3VRZH4Q9YaJBtP5RRQI1rftG',
  'district_admin',
  'Tarn Taran',
  'Tarn Taran',
  'Admin',
  '{"username":"admin_tarn_taran","email":"admin.tarntaran@punjab.gov.in","role":"district_admin","district":"Tarn Taran","firstName":"Tarn Taran","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

INSERT INTO users (
  id,
  username,
  email,
  password,
  role,
  district,
  first_name,
  last_name,
  credentials,
  is_blocked,
  created_at,
  updated_at
) VALUES (
  'QMpOk7slFMZLAs1nLifm-',
  'admin_talwara',
  'admin.talwara@punjab.gov.in',
  '$2b$10$/SefED03GtfyfnQUl14IT.BNBwJinLglyx9v3EJNwLaHJuumiWq.i',
  'district_admin',
  'Talwara',
  'Talwara',
  'Admin',
  '{"username":"admin_talwara","email":"admin.talwara@punjab.gov.in","role":"district_admin","district":"Talwara","firstName":"Talwara","lastName":"Admin"}',
  false,
  NOW(),
  NOW()
);

-- Total users created: 24
-- Central admins: 1
-- District admins: 23

-- To execute this file:
-- psql -d your_database_name -f users-seed.sql
-- or execute these statements directly in your database client
