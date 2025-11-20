/**
 * Test Allocation Logic
 * 
 * This script creates test data and verifies that the allocation algorithm
 * correctly assigns students to seats based on their preferences and merit.
 */

import { storage } from './server/storage';
import { AllocationService } from './server/services/allocationService';
import { getCurrentSession } from './server/utils/sessionUtils';

async function testAllocation() {
  console.log('🧪 Starting Allocation Test...\n');

  try {
    const currentSession = getCurrentSession();
    console.log(`📅 Current Session: ${currentSession}\n`);

    // Step 1: Create a test counseling round
    console.log('1️⃣  Creating test counseling round...');
    const testRound = await storage.createCounselingRound({
      academicYear: currentSession,
      roundNumber: 0, // Auto-incremented
      roundName: 'Test Allocation Round',
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      isActive: true,
      isCompleted: false,
    });
    console.log(`   ✅ Created round: ${testRound.roundName} - Round ${testRound.roundNumber}\n`);

    // Step 2: Create test schools
    console.log('2️⃣  Creating test schools...');
    const testSchools = [
      { udiseCode: 'TEST001', name: 'Test School Amritsar', district: 'Amritsar' },
      { udiseCode: 'TEST002', name: 'Test School Ludhiana', district: 'Ludhiana' },
      { udiseCode: 'TEST003', name: 'Test School Jalandhar', district: 'Jalandhar' },
    ];

    for (const school of testSchools) {
      await storage.bulkUpsertSchools([{
        udiseCode: school.udiseCode,
        name: school.name,
        district: school.district,
        block: 'Test Block',
        village: 'Test Village',
        pincode: '123456',
        latitude: 0,
        longitude: 0,
      }]);
    }
    console.log(`   ✅ Created ${testSchools.length} test schools\n`);

    // Step 3: Create test vacancies
    console.log('3️⃣  Creating test vacancies...');
    const testVacancies = [
      // Amritsar - Medical - Male - Open: 5 seats
      {
        academicYear: currentSession,
        udiseCode: 'TEST001',
        district: 'Amritsar',
        stream: 'Medical',
        gender: 'Male',
        category: 'Open',
        totalSeats: 5,
        availableSeats: 5,
      },
      // Amritsar - Medical - Female - Open: 3 seats
      {
        academicYear: currentSession,
        udiseCode: 'TEST001',
        district: 'Amritsar',
        stream: 'Medical',
        gender: 'Female',
        category: 'Open',
        totalSeats: 3,
        availableSeats: 3,
      },
      // Ludhiana - Commerce - Male - Open: 4 seats
      {
        academicYear: currentSession,
        udiseCode: 'TEST002',
        district: 'Ludhiana',
        stream: 'Commerce',
        gender: 'Male',
        category: 'Open',
        totalSeats: 4,
        availableSeats: 4,
      },
      // Jalandhar - NonMedical - Male - Open: 2 seats
      {
        academicYear: currentSession,
        udiseCode: 'TEST003',
        district: 'Jalandhar',
        stream: 'NonMedical',
        gender: 'Male',
        category: 'Open',
        totalSeats: 2,
        availableSeats: 2,
      },
    ];

    for (const vacancy of testVacancies) {
      await storage.createVacancy(vacancy);
    }
    console.log(`   ✅ Created ${testVacancies.length} test vacancies\n`);

    // Step 4: Create test entrance results
    console.log('4️⃣  Creating test entrance results...');
    const testEntranceResults = [
      { applicationNo: 'APP001', meritNo: 1, studentName: 'Top Student', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP002', meritNo: 2, studentName: 'Second Best', gender: 'Female', category: 'Open' },
      { applicationNo: 'APP003', meritNo: 3, studentName: 'Third Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP004', meritNo: 4, studentName: 'Fourth Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP005', meritNo: 5, studentName: 'Fifth Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP006', meritNo: 6, studentName: 'Sixth Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP007', meritNo: 7, studentName: 'Seventh Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP008', meritNo: 8, studentName: 'Eighth Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP009', meritNo: 9, studentName: 'Ninth Best', gender: 'Male', category: 'Open' },
      { applicationNo: 'APP010', meritNo: 10, studentName: 'Tenth Best', gender: 'Male', category: 'Open' },
    ];

    await storage.bulkCreateStudentsEntranceResults(
      testEntranceResults.map(er => ({
        ...er,
        academicYear: currentSession,
        rollNo: er.applicationNo.replace('APP', 'ROLL'),
        dateOfBirth: new Date('2000-01-01'),
        fatherName: 'Test Father',
        motherName: 'Test Mother',
        mobileNo: '1234567890',
      }))
    );
    console.log(`   ✅ Created ${testEntranceResults.length} test entrance results\n`);

    // Step 5: Create test students with preferences
    console.log('5️⃣  Creating test students with preferences...');
    const testStudents = [
      // Student 1: Merit 1, Medical, Male, Open - Choice1: Amritsar (should get allocated)
      {
        appNo: 'APP001',
        name: 'Top Student',
        meritNumber: 1,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        choice2: 'Ludhiana',
        choice3: 'Jalandhar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 2: Merit 2, Medical, Female, Open - Choice1: Amritsar (should get allocated)
      {
        appNo: 'APP002',
        name: 'Second Best',
        meritNumber: 2,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        choice2: 'Ludhiana',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 3: Merit 3, Commerce, Male, Open - Choice1: Ludhiana (should get allocated)
      {
        appNo: 'APP003',
        name: 'Third Best',
        meritNumber: 3,
        stream: 'Commerce',
        academicYear: currentSession,
        choice1: 'Ludhiana',
        choice2: 'Amritsar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 4: Merit 4, NonMedical, Male, Open - Choice1: Jalandhar (should get allocated)
      {
        appNo: 'APP004',
        name: 'Fourth Best',
        meritNumber: 4,
        stream: 'NonMedical',
        academicYear: currentSession,
        choice1: 'Jalandhar',
        choice2: 'Amritsar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 5: Merit 5, Medical, Male, Open - Choice1: Amritsar (should get allocated)
      {
        appNo: 'APP005',
        name: 'Fifth Best',
        meritNumber: 5,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 6: Merit 6, Medical, Male, Open - Choice1: Amritsar (should get allocated - 4th male)
      {
        appNo: 'APP006',
        name: 'Sixth Best',
        meritNumber: 6,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 7: Merit 7, Medical, Male, Open - Choice1: Amritsar (should get allocated - 5th male, last)
      {
        appNo: 'APP007',
        name: 'Seventh Best',
        meritNumber: 7,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
      // Student 8: Merit 8, Medical, Male, Open - Choice1: Amritsar (should NOT get allocated - no seats left)
      {
        appNo: 'APP008',
        name: 'Eighth Best',
        meritNumber: 8,
        stream: 'Medical',
        academicYear: currentSession,
        choice1: 'Amritsar',
        choice2: 'Ludhiana', // Should try choice2 but no Commerce stream
        counselingRoundId: testRound.id,
        counselingRoundNumber: testRound.roundNumber,
        allocationStatus: 'pending',
      },
    ];

    await storage.bulkCreateStudents(testStudents);
    console.log(`   ✅ Created ${testStudents.length} test students\n`);

    // Step 6: Run allocation
    console.log('6️⃣  Running allocation algorithm...');
    const allocationService = new AllocationService(storage);
    const result = await allocationService.runAllocation(
      currentSession,
      testRound.roundNumber,
      testRound.id
    );

    console.log('\n📊 Allocation Results:');
    console.log(`   Total Eligible Students: ${result.totalStudents}`);
    console.log(`   Successfully Allotted: ${result.allottedStudents}`);
    console.log(`   Not Allotted: ${result.notAllottedStudents}`);
    console.log(`   Allocations by District:`);
    Object.entries(result.allocationsByDistrict).forEach(([district, count]) => {
      console.log(`     - ${district}: ${count} students`);
    });

    // Step 7: Verify results
    console.log('\n7️⃣  Verifying allocation results...');
    const allocatedStudents = await storage.getStudentsByStatus('allotted', currentSession);
    const notAllottedStudents = await storage.getStudentsByStatus('not_allotted', currentSession);

    console.log(`\n   ✅ Allocated Students (${allocatedStudents.length}):`);
    for (const student of allocatedStudents) {
      console.log(`      - ${student.name} (Merit: ${student.meritNumber}) → ${student.allottedDistrict} (${student.allottedStream})`);
    }

    console.log(`\n   ❌ Not Allotted Students (${notAllottedStudents.length}):`);
    for (const student of notAllottedStudents) {
      console.log(`      - ${student.name} (Merit: ${student.meritNumber})`);
    }

    // Expected results:
    // - Students 1-7 should be allotted (7 students)
    // - Student 8 should NOT be allotted (no seats left for Medical Male Open in Amritsar)
    const expectedAllotted = 7;
    const expectedNotAllotted = 1;

    console.log('\n📋 Expected vs Actual:');
    console.log(`   Expected Allotted: ${expectedAllotted}, Actual: ${result.allottedStudents} ${result.allottedStudents === expectedAllotted ? '✅' : '❌'}`);
    console.log(`   Expected Not Allotted: ${expectedNotAllotted}, Actual: ${result.notAllottedStudents} ${result.notAllottedStudents === expectedNotAllotted ? '✅' : '❌'}`);

    if (result.allottedStudents === expectedAllotted && result.notAllottedStudents === expectedNotAllotted) {
      console.log('\n✅ All tests passed! Allocation logic is working correctly.\n');
    } else {
      console.log('\n❌ Test failed! Expected and actual results do not match.\n');
    }

    // Step 8: Check vacancy availability after allocation
    console.log('8️⃣  Checking vacancy availability after allocation...');
    const vacanciesAfter = await storage.getVacancies(currentSession);
    console.log(`   Remaining vacancies:`);
    for (const vacancy of vacanciesAfter) {
      if (vacancy.udiseCode && vacancy.udiseCode.startsWith('TEST')) {
        console.log(`     - ${vacancy.district} | ${vacancy.stream} | ${vacancy.gender} | ${vacancy.category}: ${vacancy.availableSeats}/${vacancy.totalSeats} seats`);
      }
    }

    console.log('\n✅ Test completed!\n');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    throw error;
  }
}

// Run the test
testAllocation()
  .then(() => {
    console.log('Test script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test script failed:', error);
    process.exit(1);
  });


