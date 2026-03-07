-- Update SAS Nagar and Mohali representations to 'SAS Nagar (Mohali)'
UPDATE district_status SET district = 'SAS Nagar (Mohali)' WHERE district IN ('SAS Nagar', 'Mohali');
UPDATE users SET district = 'SAS Nagar (Mohali)' WHERE district IN ('SAS Nagar', 'Mohali');
UPDATE students SET counseling_district = 'SAS Nagar (Mohali)' WHERE counseling_district IN ('SAS Nagar', 'Mohali');
UPDATE students SET allotted_district = 'SAS Nagar (Mohali)' WHERE allotted_district IN ('SAS Nagar', 'Mohali');

-- Update Pathankot assignments and choices to Gurdaspur
UPDATE students SET allotted_district = 'Gurdaspur' WHERE allotted_district = 'Pathankot';
UPDATE students SET choice1 = 'Gurdaspur' WHERE choice1 = 'Pathankot';
UPDATE students SET choice2 = 'Gurdaspur' WHERE choice2 = 'Pathankot';
UPDATE students SET choice3 = 'Gurdaspur' WHERE choice3 = 'Pathankot';
UPDATE students SET choice4 = 'Gurdaspur' WHERE choice4 = 'Pathankot';
UPDATE students SET choice5 = 'Gurdaspur' WHERE choice5 = 'Pathankot';
UPDATE students SET choice6 = 'Gurdaspur' WHERE choice6 = 'Pathankot';
UPDATE students SET choice7 = 'Gurdaspur' WHERE choice7 = 'Pathankot';
UPDATE students SET choice8 = 'Gurdaspur' WHERE choice8 = 'Pathankot';
UPDATE students SET choice9 = 'Gurdaspur' WHERE choice9 = 'Pathankot';
UPDATE students SET choice10 = 'Gurdaspur' WHERE choice10 = 'Pathankot';
