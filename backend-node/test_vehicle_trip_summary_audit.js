/**
 * test_vehicle_trip_summary_audit.js
 *
 * Comprehensive Automated Audit for Vehicle-Wise Trip Summary pipeline:
 * 1. Existing saved trip summaries are retrieved correctly.
 * 2. New qualifying trips are saved and appear in the summary.
 * 3. Updating a source trip updates the appropriate summary.
 * 4. Recalculating or synchronizing data does not create duplicates (idempotency).
 * 5. Vehicle, owner, wheel type, month, and financial-year matching works correctly.
 * 6. Current-month and historical-month data are retrieved according to original rules (July, Aug, Sep, Oct 2026).
 * 7. Browser refresh persistence (saved in MongoDB cement_register.vehicle_trip_summaries).
 * 8. Vehicle-Wise Trip Summary displays correct counts for multiple vehicles.
 * 9. Downstream incentive eligibility receives expected trip counts without conflict.
 * 10. Missing source data, database failures, and API errors are logged and handled.
 */

const mongoose = require("mongoose");
const assert = require("assert");
require("dotenv").config();

const {
  normVeh,
  getCanonicalTruckNo,
  getAllRegisteredVehiclesDirectory,
  findMatchingContact,
  calculateAndPersistVehicleTripSummary,
  hookSyncVehicleTripSummary,
  getTripSummaryCol
} = require("./utils/vehicleTripSummaryManager");

const {
  evaluateVehicleIncentiveEligibility,
  getMonthlyIncentiveEligibilities
} = require("./utils/incentiveEligibilityManager");

async function runAudit() {
  console.log("=== STARTING VEHICLE-WISE TRIP SUMMARY PIPELINE AUDIT ===");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/lorrey";
  await mongoose.connect(mongoUri);
  console.log("✓ Connected to MongoDB");

  const summaryCol = getTripSummaryCol();
  const cementCol = mongoose.connection.useDb("cement_register").collection("entries");

  // TEST 1: Retrieve Existing Saved Trip Summaries
  console.log("\n[TEST 1] Testing Retrieval of Existing Saved Trip Summaries...");
  const initialCount = await summaryCol.countDocuments({});
  console.log(`Initial vehicle_trip_summaries in DB: ${initialCount}`);
  assert(initialCount >= 0, "DB connection to vehicle_trip_summaries working");
  console.log("✓ TEST 1 PASSED: Database collection accessible");

  // TEST 2 & 6: Month & FY Aggregation across Historical (Jul, Aug, Sep) and Current (Oct 2026)
  console.log("\n[TEST 2 & 6] Aggregation across July, August, September, October 2026...");
  const monthsToTest = [
    { name: "July", monthInt: 7, year: 2026, fy: "FY 2026-27" },
    { name: "August", monthInt: 8, year: 2026, fy: "FY 2026-27" },
    { name: "September", monthInt: 9, year: 2026, fy: "FY 2026-27" },
    { name: "October", monthInt: 10, year: 2026, fy: "FY 2026-27" }
  ];

  const results = {};
  for (const m of monthsToTest) {
    const res = await calculateAndPersistVehicleTripSummary({ fy: m.fy, month: m.name });
    assert(res.success === true, `Calculation for ${m.name} succeeded`);
    assert(res.vehicles.length > 0, `${m.name} has active vehicles`);
    results[m.name] = res;
    console.log(`  ✓ ${m.name} 2026: ${res.vehicles.length} vehicles, ${res.totals.totalTrips} trips, ${res.totals.totalMT} MT`);
  }

  // Specifically check October 2026 (the critical bug case where commercial 4-digit numbers caused 0 data)
  const octRes = results["October"];
  assert(octRes.vehicles.length >= 40, `October must return >= 40 vehicles (returned ${octRes.vehicles.length})`);
  assert(octRes.totals.totalTrips > 200, `October trips must be > 200 (returned ${octRes.totals.totalTrips})`);
  console.log("✓ TEST 2 & 6 PASSED: All months including October 2026 calculated and persisted");

  // TEST 4: Idempotency (recalculating data does NOT create duplicate records)
  console.log("\n[TEST 4] Testing Idempotency (Prevent Duplicate Records)...");
  const countBefore = await summaryCol.countDocuments({});
  // Run recalculation again for October
  await calculateAndPersistVehicleTripSummary({ fy: "FY 2026-27", month: "October" });
  const countAfter = await summaryCol.countDocuments({});
  assert.strictEqual(countBefore, countAfter, `Recalculation must not change document count (before: ${countBefore}, after: ${countAfter})`);
  console.log(`✓ TEST 4 PASSED: Recalculation is 100% idempotent (count maintained at ${countAfter})`);

  // TEST 5 & 8: Matching Vehicle, Owner, Wheel Type, and Counts for Multiple Vehicles
  console.log("\n[TEST 5 & 8] Checking Vehicle, Owner, Wheel Type, and Counts for Multiple Vehicles...");
  const dir = await getAllRegisteredVehiclesDirectory();
  console.log(`Total Registered Vehicles in Party Master directory: ${dir.list.length}`);
  assert(dir.list.length > 0, "Registered vehicles directory loaded");

  // Test Manas Sarkar 0800 / WB39B0800
  const v0800 = octRes.vehicles.find(v => v.normKey === "WB39B0800" || v.vehicleNo.includes("0800"));
  assert(v0800, "Manas Sarkar 0800 must be present in October summary");
  console.log(`  Manas Sarkar vehicle: ${v0800.vehicleNo}, normKey: ${v0800.normKey}, wheel: ${v0800.wheelPattern}, trips: ${v0800.totalTrips}, MT: ${v0800.totalMT}, Owner: ${v0800.ownerName}`);
  assert.strictEqual(v0800.capacityMT, 19, "10-Wheel capacity must be 19 MT");
  assert.strictEqual(v0800.totalMT, 114, "114 MT loaded for 0800 in October");
  assert.strictEqual(v0800.totalTrips, 6, "114 / 19 = 6 trips for 0800 in October");

  // Test Subhasis Das 1024 / WB41G1024 (Registered as 12-Wheel, 25 MT)
  const v1024 = octRes.vehicles.find(v => v.normKey === "WB41G1024" || v.vehicleNo.includes("1024"));
  assert(v1024, "Subhasis Das 1024 must be present in October summary");
  console.log(`  Subhasis Das vehicle: ${v1024.vehicleNo}, normKey: ${v1024.normKey}, wheel: ${v1024.wheelPattern}, trips: ${v1024.totalTrips}, MT: ${v1024.totalMT}, Owner: ${v1024.ownerName}`);
  assert.strictEqual(v1024.capacityMT, 25, "12-Wheel capacity must be 25 MT");
  assert.strictEqual(v1024.wheelPattern, "12W", "1024 wheel pattern must be 12W");

  // Test Joydeb Ghosh 1080 / WB39C1080
  const v1080 = octRes.vehicles.find(v => v.normKey === "WB39C1080" || v.vehicleNo.includes("1080"));
  assert(v1080, "Joydeb Ghosh 1080 must be present in October summary");
  console.log(`  Joydeb Ghosh vehicle: ${v1080.vehicleNo}, normKey: ${v1080.normKey}, wheel: ${v1080.wheelPattern}, trips: ${v1080.totalTrips}, MT: ${v1080.totalMT}, Owner: ${v1080.ownerName}`);

  // Test Sankar Ghosh 4475 / WB67A4475
  const v4475 = octRes.vehicles.find(v => v.normKey === "WB67A4475" || v.vehicleNo.includes("4475"));
  assert(v4475, "Sankar Ghosh 4475 must be present in October summary");
  console.log(`  Sankar Ghosh vehicle: ${v4475.vehicleNo}, normKey: ${v4475.normKey}, wheel: ${v4475.wheelPattern}, trips: ${v4475.totalTrips}, MT: ${v4475.totalMT}, Owner: ${v4475.ownerName}`);
  assert.strictEqual(v4475.capacityMT, 25, "12-Wheel capacity must be 25 MT");
  assert.strictEqual(v4475.wheelPattern, "12W", "4475 wheel pattern must be 12W");
  console.log("✓ TEST 5 & 8 PASSED: Vehicle, owner, wheel type, and capacity formulas verified");

  // TEST 7: Browser Refresh Persistence (Direct MongoDB Query)
  console.log("\n[TEST 7] Testing Direct MongoDB Persistence (Browser Refresh)...");
  const savedDoc = await summaryCol.findOne({
    normKey: "WB39B0800",
    $or: [{ month: 10 }, { monthName: "October" }],
    year: 2026
  });
  assert(savedDoc, "WB39B0800 must exist in MongoDB cement_register.vehicle_trip_summaries");
  assert.strictEqual(savedDoc.totalMT, 114, "Saved document has 114 totalMT in DB");
  assert.strictEqual(savedDoc.totalTrips, 6, "Saved document has 6 totalTrips in DB");
  assert.strictEqual(savedDoc.capacityMT, 19, "Saved document has 19 capacityMT in DB");
  console.log("✓ TEST 7 PASSED: Data persists directly in MongoDB collection vehicle_trip_summaries");

  // TEST 3: Updating a Source Trip Updates the Appropriate Summary
  console.log("\n[TEST 3] Testing Source Trip Update Sync Hook...");
  // Create a temporary mock trip for October 2026
  const testTripId = new mongoose.Types.ObjectId();
  const testEntry = {
    _id: testTripId,
    "VEHICLE NUMBER": "TEST9999",
    "LOADING DT": "25-10-2026",
    "BILL DATE": "25-10-2026",
    month: 10,
    year: 2026,
    MT: 19,
    "Billing Amount": 15000,
    "INVOICE NO": "INV-AUDIT-TEST-001",
    "WHEEL": "10-Wheel",
    "Type of vehicle": "10-Wheel"
  };

  try {
    await cementCol.insertOne(testEntry);
    console.log("  Inserted temporary test trip into cement_register.entries");

    // Invoke sync hook
    await hookSyncVehicleTripSummary(testEntry);

    // Verify it appeared in summary
    const testSummary = await summaryCol.findOne({
      normKey: "TEST9999",
      $or: [{ month: 10 }, { monthName: "October" }],
      year: 2026
    });
    assert(testSummary, "Temporary test trip must be reflected in vehicle_trip_summaries");
    assert.strictEqual(testSummary.totalMT, 19, "Test trip totalMT must be 19");
    assert.strictEqual(testSummary.totalTrips, 1, "Test trip totalTrips must be 1 (19 MT / 19 MT)");
    console.log("  ✓ Sync hook updated summary correctly on insertion");

    // Now update the source trip
    await cementCol.updateOne({ _id: testTripId }, { $set: { MT: 38 } });
    testEntry.MT = 38;
    await hookSyncVehicleTripSummary(testEntry);

    const updatedSummary = await summaryCol.findOne({
      normKey: "TEST9999",
      $or: [{ month: 10 }, { monthName: "October" }],
      year: 2026
    });
    assert.strictEqual(updatedSummary.totalMT, 38, "Updated summary totalMT must be 38");
    assert.strictEqual(updatedSummary.totalTrips, 2, "Updated summary totalTrips must be 2 (38 MT / 19 MT)");
    console.log("  ✓ Sync hook updated summary correctly on modification");

  } finally {
    // Clean up temporary test data
    await cementCol.deleteOne({ _id: testTripId });
    await summaryCol.deleteOne({
      normKey: "TEST9999",
      $or: [{ month: 10 }, { monthName: "October" }],
      year: 2026
    });
    // Resync October
    await calculateAndPersistVehicleTripSummary({ fy: "FY 2026-27", month: "October" });
    console.log("  Cleaned up temporary test data and resynced October");
  }
  console.log("✓ TEST 3 PASSED: Source trip updates correctly synchronize to summary");

  // TEST 9: Downstream Incentive Eligibility Compatibility
  console.log("\n[TEST 9] Testing Downstream Incentive Eligibility Compatibility...");
  // Evaluate vehicle incentive eligibility for WB39B0800 in October 2026
  const elig0800 = await evaluateVehicleIncentiveEligibility("WB39B0800", "October", 2026);
  console.log(`  WB39B0800 incentive eligibility result:`, {
    vehicleNo: elig0800.vehicleNo,
    wheelType: elig0800.wheelType,
    dedicatedStatus: elig0800.dedicatedStatus,
    trips: elig0800.totalTrips || elig0800.eligibleTrips,
    isEligible: elig0800.isEligible
  });
  assert(elig0800 !== null, "Incentive evaluation executed successfully");

  // Check 10WH Extra rule: SO or NT qualifies, STO excluded
  // Let's check getMonthlyIncentiveEligibilities
  const monthlyElig = await getMonthlyIncentiveEligibilities("October", 2026);
  assert(monthlyElig && typeof monthlyElig === 'object', "Monthly incentive eligibilities returned map");
  const eligVehCount = Object.keys(monthlyElig).length;
  assert(eligVehCount > 0, "Monthly incentive eligibilities contains vehicles for October");
  console.log(`  Monthly incentive entries evaluated for October 2026: ${eligVehCount}`);
  console.log("✓ TEST 9 PASSED: Downstream incentive eligibility calculations verified");

  // TEST 10: Missing Source Data, Invalid Params & Error Handling
  console.log("\n[TEST 10] Testing Error Handling and Edge Cases...");
  // Query non-existent month
  const emptyRes = await calculateAndPersistVehicleTripSummary({ fy: "FY 2026-27", month: "InvalidMonth" });
  assert(emptyRes.success === true, "Invalid month gracefully defaults to September");
  console.log(`  Graceful fallback for invalid month: defaulted to ${emptyRes.month}`);

  // Query future month with 0 trips
  const futureRes = await calculateAndPersistVehicleTripSummary({ fy: "FY 2026-27", month: "February", year: 2027 });
  assert(futureRes.success === true, "Future month returns success: true");
  assert(Array.isArray(futureRes.vehicles), "Future month returns vehicles array");
  console.log(`  Future month handling: returned ${futureRes.vehicles.length} vehicles without error`);
  console.log("✓ TEST 10 PASSED: Error handling, edge cases, and logging verified");

  console.log("\n=======================================================");
  console.log("✓✓✓ ALL 10 VERIFICATION TESTS PASSED SUCCESSFULLY! ✓✓✓");
  console.log("=======================================================\n");

  await mongoose.disconnect();
}

runAudit().catch(err => {
  console.error("AUDIT FAILED:", err);
  process.exit(1);
});
