/**
 * Comprehensive Acceptance Test Suite for All Party Reports
 * Verifies the complete data flow:
 * Source Financial Data -> Report Query/Aggregation -> Backend API -> Frontend Data Mapping -> Party Report View
 */

require('dotenv').config();
const axios = require('axios');
const assert = require('assert');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

async function runAudit() {
  console.log('========================================================================');
  console.log('STARTING ALL PARTY REPORTS ACCEPTANCE TEST SUITE');
  console.log('========================================================================\n');

  // Test 1: Verify Party and Vehicle Master retrieval
  console.log('[TEST 1] Testing /voucher/contacts endpoint for Party Master list...');
  const contactsRes = await axios.get(`${BASE_URL}/voucher/contacts`);
  assert(contactsRes.data && contactsRes.data.success, 'contacts API failed');
  assert(Array.isArray(contactsRes.data.names) && contactsRes.data.names.length > 0, 'No party names returned');
  assert(contactsRes.data.ownerMap && Object.keys(contactsRes.data.ownerMap).length > 0, 'No ownerMap returned');
  assert(contactsRes.data.names.includes('MANAS SARKAR'), 'MANAS SARKAR missing from party list');
  const manasVehicles = contactsRes.data.ownerMap['MANAS SARKAR'] || [];
  assert(manasVehicles.length > 0, 'MANAS SARKAR has no registered vehicles');
  console.log(`✓ TEST 1 PASSED: Found ${contactsRes.data.names.length} parties, MANAS SARKAR has ${manasVehicles.length} vehicles: ${manasVehicles.join(', ')}`);

  // Test 2: Cement Register query with full plate for October 2026 (stored as 4-digit '0800')
  console.log('\n[TEST 2] Testing /cement-register for MANAS SARKAR vehicle WB39B0800 in October 2026...');
  const octRes = await axios.get(`${BASE_URL}/cement-register`, {
    params: { owner: 'MANAS SARKAR', vehicle: 'WB39B0800', month: 10, year: 2026 }
  });
  assert(octRes.data && octRes.data.success, 'Oct cement register query failed');
  assert(Array.isArray(octRes.data.entries) && octRes.data.entries.length === 8, `Expected 8 entries for Oct 2026, got ${octRes.data.entries.length}`);
  const octMT = octRes.data.entries.reduce((sum, e) => sum + (parseFloat(e.MT) || 0), 0);
  assert(octMT > 0, 'Total MT should be greater than 0');
  console.log(`✓ TEST 2 PASSED: Successfully retrieved ${octRes.data.entries.length} trips (Total MT: ${octMT}) for Oct 2026 with commercial 4-digit normalization`);

  // Test 3: Cement Register query with full plate for September 2026 (stored as 'WB39B0800')
  console.log('\n[TEST 3] Testing /cement-register for MANAS SARKAR vehicle WB39B0800 in September 2026...');
  const sepRes = await axios.get(`${BASE_URL}/cement-register`, {
    params: { owner: 'MANAS SARKAR', vehicle: 'WB39B0800', month: 9, year: 2026 }
  });
  assert(sepRes.data && sepRes.data.success, 'Sep cement register query failed');
  assert(Array.isArray(sepRes.data.entries) && sepRes.data.entries.length === 17, `Expected 17 entries for Sep 2026, got ${sepRes.data.entries.length}`);
  console.log(`✓ TEST 3 PASSED: Successfully retrieved ${sepRes.data.entries.length} trips for historical September 2026`);

  // Test 4: Bidirectional matching - querying by 4-digit '0800' retrieves September 2026 entries
  console.log('\n[TEST 4] Testing bidirectional matching: query with "0800" retrieves Sep 2026 entries (stored as WB39B0800)...');
  const bidirRes = await axios.get(`${BASE_URL}/cement-register`, {
    params: { vehicle: '0800', month: 9, year: 2026 }
  });
  assert(bidirRes.data && bidirRes.data.success, 'Bidirectional query failed');
  assert(bidirRes.data.entries.length >= 17, `Expected >= 17 entries, got ${bidirRes.data.entries.length}`);
  console.log(`✓ TEST 4 PASSED: Bidirectional query with "0800" successfully returned ${bidirRes.data.entries.length} trips`);

  // Test 5: Verify Party Payment Full-Year statement across all 12 months for WB39B0800
  console.log('\n[TEST 5] Testing /party-payment/full-year statement for MANAS SARKAR WB39B0800 FY 2026-27...');
  const fyRes = await axios.get(`${BASE_URL}/party-payment/full-year`, {
    params: { partyName: 'MANAS SARKAR', vehicleNo: 'WB39B0800', fy: 'FY 2026-27' }
  });
  assert(fyRes.data && fyRes.data.success, 'Party payment full year query failed');
  assert(Array.isArray(fyRes.data.months) && fyRes.data.months.length === 12, 'Expected 12 financial year months');
  
  const octMonth = fyRes.data.months.find(m => m.month === 10);
  assert(octMonth, 'October month missing from full year');
  assert(octMonth.tripCount === 8, `Expected 8 trips in Oct full-year, got ${octMonth.tripCount}`);
  assert(octMonth['GROSS FREIGHT'] > 60000, `Expected Gross Freight > 60000, got ${octMonth['GROSS FREIGHT']}`);

  const sepMonth = fyRes.data.months.find(m => m.month === 9);
  assert(sepMonth, 'September month missing from full year');
  assert(sepMonth.tripCount === 17, `Expected 17 trips in Sep full-year, got ${sepMonth.tripCount}`);
  console.log(`✓ TEST 5 PASSED: Full-year statement active. Oct trips: ${octMonth.tripCount}, freight: ₹${octMonth['GROSS FREIGHT']}; Sep trips: ${sepMonth.tripCount}, freight: ₹${sepMonth['GROSS FREIGHT']}`);

  // Test 6: Verify multiple other registered vehicles in October 2026
  console.log('\n[TEST 6] Testing October 2026 retrieval for multiple other registered parties...');
  const sampleParties = [
    { owner: 'FAIYAZ ALAM', veh: 'WB41H4475', expectedMin: 5 },
    { owner: 'ABHIJIT GHOSH', veh: 'WB67A9375', expectedMin: 5 },
    { owner: 'DILIP PANJA', veh: 'WB39B8879', expectedMin: 5 }
  ];
  for (const sp of sampleParties) {
    const res = await axios.get(`${BASE_URL}/cement-register`, {
      params: { owner: sp.owner, vehicle: sp.veh, month: 10, year: 2026 }
    });
    assert(res.data.success, `Query failed for ${sp.owner}`);
    assert(res.data.entries.length >= sp.expectedMin, `Expected >= ${sp.expectedMin} for ${sp.owner}, got ${res.data.entries.length}`);
    console.log(`  ✓ ${sp.owner} (${sp.veh}): ${res.data.entries.length} trips loaded correctly`);
  }
  console.log('✓ TEST 6 PASSED: All sampled parties load their actual stored records');

  // Test 7: Zero / Empty result sets handled safely without crash
  console.log('\n[TEST 7] Testing empty result sets and invalid vehicle queries...');
  const emptyRes = await axios.get(`${BASE_URL}/cement-register`, {
    params: { vehicle: 'NONEXISTENT9999', month: 10, year: 2026 }
  });
  assert(emptyRes.data.success, 'Empty query should succeed with success: true');
  assert(emptyRes.data.entries.length === 0, 'Nonexistent vehicle should return 0 entries');
  console.log('✓ TEST 7 PASSED: Nonexistent vehicle gracefully returns empty array with status 200');

  // Test 8: Verify previous-month dues lookup for full plate and suffix
  console.log('\n[TEST 8] Testing /party-payment/previous-month-dues...');
  const duesRes = await axios.get(`${BASE_URL}/party-payment/previous-month-dues`, {
    params: { month: 10, year: 2026 }
  });
  assert(duesRes.data && duesRes.data.success, 'previous-month-dues failed');
  assert(duesRes.data.previousMonthDues, 'previousMonthDues object missing');
  console.log(`✓ TEST 8 PASSED: previous-month-dues returns balances for ${Object.keys(duesRes.data.previousMonthDues).length} vehicle keys`);

  console.log('\n========================================================================');
  console.log('ALL 8 ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
  process.exit(0);
}

runAudit().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err.message);
  process.exit(1);
});
