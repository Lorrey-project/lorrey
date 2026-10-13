const mongoose = require('mongoose');
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  evaluateVehicleIncentiveEligibility,
  getMonthlyIncentiveEligibilities,
  isInvoiceSoAndNt
} = require('./utils/incentiveEligibilityManager');

const TEST_MONTH = 11;
const TEST_YEAR = 2026;

async function runTests() {
  console.log("========================================================================");
  console.log("RUNNING USER-SPECIFIED 16 ACCEPTANCE CRITERIA SUITE");
  console.log("========================================================================\n");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/lorrey_transport');
  }

  const invoiceDb = mongoose.connection.useDb('invoice_system');
  const cementDb = mongoose.connection.useDb('cement_register');

  const ownerCol = invoiceDb.collection('owner details');
  const entriesCol = cementDb.collection('entries');

  const testVehicles = [];

  async function createVehicle(veh, wheel, custType, dedicatedType) {
    testVehicles.push(veh);
    await ownerCol.deleteMany({ "Truck No": veh });
    await entriesCol.deleteMany({ "VEHICLE NUMBER": veh, month: TEST_MONTH, year: TEST_YEAR });

    await ownerCol.insertOne({
      "Truck No": veh,
      "Owner Name": `Owner ${veh}`,
      "Type of vehicle": wheel,
      "TYPE OF CUSTOMER ": custType,
      "Dedicated Type": dedicatedType
    });
  }

  async function addTrip(veh, invNo, opts = {}) {
    const e = {
      "VEHICLE NUMBER": veh,
      "INVOICE NO": invNo,
      "LOADING DT": opts.date || `01-${TEST_MONTH}-${TEST_YEAR}`,
      month: TEST_MONTH,
      year: TEST_YEAR,
      "MT": opts.mt !== undefined ? opts.mt : 10,
      "BILLING": opts.billing !== undefined ? opts.billing : 100, // 10 * 100 = 1000
      "Party Rate": opts.partyRate !== undefined ? opts.partyRate : 95, // 10 * 95 = 950
      "Bill Type": opts.billType || "NT",
      "SITE": opts.site || "NVL",
      "UNLOADING STATUS": opts.unloadingStatus || ""
    };
    await entriesCol.insertOne(e);
    return e;
  }

  const results = [];

  function record(id, desc, passed, details = "") {
    results.push({ id, desc, passed, details });
    console.log(`${passed ? "✅" : "❌"} Req ${id}: ${desc}`);
    if (details) console.log(`   Details: ${details}`);
  }

  try {
    // 1. Non-Dedicated 12WH ATOA with 20 trips: standard incentive = 0
    {
      const veh = "TEST_REQ1_12W_ATOA";
      await createVehicle(veh, "12WH", "ATOA", "Non-Dedicated");
      for (let i = 1; i <= 20; i++) {
        await addTrip(veh, `INV_R1_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(1, "Non-Dedicated 12WH ATOA with 20 trips: standard incentive = 0", passed,
        `eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 2. Non-Dedicated 12WH MKT with 20 trips: standard incentive = 0
    {
      const veh = "TEST_REQ2_12W_MKT";
      await createVehicle(veh, "12WH", "MKT", "Non-Dedicated");
      for (let i = 1; i <= 20; i++) {
        await addTrip(veh, `INV_R2_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(2, "Non-Dedicated 12WH MKT with 20 trips: standard incentive = 0", passed,
        `eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 3. Non-Dedicated 14WH with 20 trips: standard incentive = 0
    {
      const veh = "TEST_REQ3_14W";
      await createVehicle(veh, "14WH", "MKT", "Non-Dedicated");
      for (let i = 1; i <= 20; i++) {
        await addTrip(veh, `INV_R3_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(3, "Non-Dedicated 14WH with 20 trips: standard incentive = 0", passed,
        `eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 4. Non-Dedicated 10WH with 20 trips: standard incentive = 0
    {
      const veh = "TEST_REQ4_10W";
      await createVehicle(veh, "10WH", "MKT", "Non-Dedicated");
      for (let i = 1; i <= 20; i++) {
        await addTrip(veh, `INV_R4_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(4, "Non-Dedicated 10WH with 20 trips: standard incentive = 0", passed,
        `eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 5. Non-Dedicated 6WH with 20 trips: standard incentive = 0
    {
      const veh = "TEST_REQ5_6W";
      await createVehicle(veh, "6WH", "ATOA", "Non-Dedicated");
      for (let i = 1; i <= 20; i++) {
        await addTrip(veh, `INV_R5_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(5, "Non-Dedicated 6WH with 20 trips: standard incentive = 0", passed,
        `eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 6. Dedicated 12WH with only 5 qualifying trips: standard incentive = 0
    {
      const veh = "TEST_REQ6_12W_5TRIPS";
      await createVehicle(veh, "12WH", "ATOA", "Dedicated");
      for (let i = 1; i <= 5; i++) {
        await addTrip(veh, `INV_R6_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(6, "Dedicated 12WH with only 5 qualifying trips: standard incentive = 0", passed,
        `trips=${res.qualifyingTripsCount}, required=6, eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 7. Dedicated 12WH with 6 qualifying trips: calculate applicable standard incentive using existing rate
    {
      const vehAtoa = "TEST_REQ7_12W_ATOA";
      await createVehicle(vehAtoa, "12WH", "ATOA", "Dedicated");
      // 6 trips, 10 MT * 100 billing = 1000 freight per trip -> total 6,000 Bill Freight
      // Rate 9.5% -> 570
      for (let i = 1; i <= 6; i++) {
        await addTrip(vehAtoa, `INV_R7A_${i}`, { mt: 10, billing: 100 });
      }
      const resAtoa = await evaluateVehicleIncentiveEligibility(vehAtoa, TEST_MONTH, TEST_YEAR);

      const vehMkt = "TEST_REQ7_12W_MKT";
      await createVehicle(vehMkt, "12WH", "MKT", "Dedicated");
      // 6 trips, 10 MT * 95 party rate = 950 freight per trip -> total 5,700 Party Freight
      // Rate 9.5% -> 542
      for (let i = 1; i <= 6; i++) {
        await addTrip(vehMkt, `INV_R7B_${i}`, { mt: 10, partyRate: 95 });
      }
      const resMkt = await evaluateVehicleIncentiveEligibility(vehMkt, TEST_MONTH, TEST_YEAR);

      const passed = resAtoa.standardIncentive.eligible === true && resAtoa.standardIncentive.amount === 570 &&
                     resMkt.standardIncentive.eligible === true && resMkt.standardIncentive.amount === 542;
      record(7, "Dedicated 12WH with 6 qualifying trips: standard incentive calculated correctly", passed,
        `ATOA (9.5% on 6000 Bill Freight)=${resAtoa.standardIncentive.amount}, MKT (9.5% on 5700 Party Rate)=${resMkt.standardIncentive.amount}`);
    }

    // 8. Dedicated 6WH with only 9 qualifying trips: standard incentive = 0
    {
      const veh = "TEST_REQ8_6W_9TRIPS";
      await createVehicle(veh, "6WH", "ATOA", "Dedicated");
      for (let i = 1; i <= 9; i++) {
        await addTrip(veh, `INV_R8_${i}`);
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false && res.standardIncentive.amount === 0;
      record(8, "Dedicated 6WH with only 9 qualifying trips: standard incentive = 0", passed,
        `trips=${res.qualifyingTripsCount}, required=10, eligible=${res.standardIncentive.eligible}, amount=${res.standardIncentive.amount}`);
    }

    // 9. Dedicated 6WH with 10 qualifying trips: calculate applicable standard incentive
    {
      const vehAtoa = "TEST_REQ9_6W_ATOA";
      await createVehicle(vehAtoa, "6WH", "ATOA", "Dedicated");
      // 10 trips * 1000 = 10,000 Bill Freight -> 9.5% = 950
      for (let i = 1; i <= 10; i++) {
        await addTrip(vehAtoa, `INV_R9A_${i}`, { mt: 10, billing: 100 });
      }
      const resAtoa = await evaluateVehicleIncentiveEligibility(vehAtoa, TEST_MONTH, TEST_YEAR);

      const vehMkt = "TEST_REQ9_6W_MKT";
      await createVehicle(vehMkt, "6WH", "MKT", "Dedicated");
      // 10 trips * 950 = 9,500 Party Rate -> 8.5% = 808
      for (let i = 1; i <= 10; i++) {
        await addTrip(vehMkt, `INV_R9B_${i}`, { mt: 10, partyRate: 95 });
      }
      const resMkt = await evaluateVehicleIncentiveEligibility(vehMkt, TEST_MONTH, TEST_YEAR);

      const passed = resAtoa.standardIncentive.eligible === true && resAtoa.standardIncentive.amount === 950 &&
                     resMkt.standardIncentive.eligible === true && resMkt.standardIncentive.amount === 808;
      record(9, "Dedicated 6WH with 10 qualifying trips: standard incentive calculated correctly", passed,
        `ATOA (9.5% on 10k)=${resAtoa.standardIncentive.amount}, MKT (8.5% on 9.5k)=${resMkt.standardIncentive.amount}`);
    }

    // 10. Non-Dedicated 10WH with a qualifying SO + NT invoice: calculate 10WH EXTRA independently, standard = 0
    {
      const veh = "TEST_REQ10_10W_SONT";
      await createVehicle(veh, "10WH", "MKT", "Non-Dedicated");
      // 1 trip: SO + NT, Party Rate 10 * 190 = 1,900 -> 8.5% = 161.5 -> 162
      await addTrip(veh, `INV_R10_1`, {
        mt: 10,
        partyRate: 190,
        billType: "SO",
        unloadingStatus: "380 B RECD-NT PROJECT-05.11.26"
      });
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false &&
                     res.standardIncentive.amount === 0 &&
                     res.extra10WheelIncentive.eligible === true &&
                     res.extra10WheelIncentive.amount === 162 &&
                     res.totalProjectedIncentive === 162;
      record(10, "Non-Dedicated 10WH with SO + NT: 10WH EXTRA calculated, standard = 0", passed,
        `standard=${res.standardIncentive.amount}, extra10W=${res.extra10WheelIncentive.amount}, total=${res.totalProjectedIncentive}`);
    }

    // 11. Non-Dedicated 10WH with STO invoice or without NT classification: no 10WH EXTRA
    {
      const vehSto = "TEST_REQ11_10W_STO";
      await createVehicle(vehSto, "10WH", "MKT", "Non-Dedicated");
      await addTrip(vehSto, `INV_R11_STO`, {
        mt: 10,
        partyRate: 190,
        billType: "STO",
        unloadingStatus: "380 B RECD-NT PROJECT"
      });
      const resSto = await evaluateVehicleIncentiveEligibility(vehSto, TEST_MONTH, TEST_YEAR);

      const vehCement = "TEST_REQ11_10W_CEMENT";
      await createVehicle(vehCement, "10WH", "MKT", "Non-Dedicated");
      await addTrip(vehCement, `INV_R11_CEM`, {
        mt: 10,
        partyRate: 190,
        billType: "SO",
        unloadingStatus: "380 B RECD-SAUDAGAR CEMENT-7908209670-4.10.26" // Dealer name contains "CEMENT"
      });
      const resCement = await evaluateVehicleIncentiveEligibility(vehCement, TEST_MONTH, TEST_YEAR);

      const passed = resSto.extra10WheelIncentive.eligible === false && resSto.extra10WheelIncentive.amount === 0 &&
                     resCement.extra10WheelIncentive.eligible === false && resCement.extra10WheelIncentive.amount === 0;
      record(11, "Non-Dedicated 10WH with STO or non-NT (e.g. SAUDAGAR CEMENT): extra 10WH = 0", passed,
        `STO extra=${resSto.extra10WheelIncentive.amount}, SAUDAGAR CEMENT extra=${resCement.extra10WheelIncentive.amount}`);
    }

    // 12. A 6WH vehicle with fewer than 6 qualifying trips: 6WH EXTRA = 0
    {
      const veh = "TEST_REQ12_6W_5TRIPS";
      await createVehicle(veh, "6WH", "MKT", "Non-Dedicated");
      for (let i = 1; i <= 5; i++) {
        await addTrip(veh, `INV_R12_${i}`, { mt: 10, partyRate: 95 });
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.extra6WheelIncentive.eligible === false && res.extra6WheelIncentive.amount === 0;
      record(12, "6WH vehicle with fewer than 6 qualifying trips: 6WH EXTRA = 0", passed,
        `trips=${res.qualifyingTripsCount}, required=6, eligible=${res.extra6WheelIncentive.eligible}, amount=${res.extra6WheelIncentive.amount}`);
    }

    // 13. Verify every vehicle currently marked Non-Dedicated has zero standard incentive in DB
    {
      const eligibilitiesMonth9 = await getMonthlyIncentiveEligibilities("2026-2027", 9);
      const eligibilitiesMonth10 = await getMonthlyIncentiveEligibilities("2026-2027", 10);
      const allEligibilities = [...Object.values(eligibilitiesMonth9), ...Object.values(eligibilitiesMonth10)];

      const nonDedicatedWithStandard = allEligibilities.filter(e => !e.isDedicated && e.standardIncentive && e.standardIncentive.amount > 0);
      const passed = allEligibilities.length > 0 && nonDedicatedWithStandard.length === 0;
      record(13, "Every Non-Dedicated vehicle in active database has zero standard incentive", passed,
        `Total vehicle records evaluated: ${allEligibilities.length}, Non-Dedicated with standard > 0: ${nonDedicatedWithStandard.length}`);
    }

    // 14. Verify Total (Projected) does not include ineligible standard incentive amounts
    {
      const eligibilitiesMonth10 = await getMonthlyIncentiveEligibilities("2026-2027", 10);
      let violations = 0;
      for (const [truck, val] of Object.entries(eligibilitiesMonth10)) {
        if (!val.isDedicated && val.standardIncentive && val.standardIncentive.amount > 0) violations++;
        const expectedTotal = (val.isDedicated ? (val.standardIncentive ? val.standardIncentive.amount : 0) : 0) +
                              (val.extra10WheelIncentive ? val.extra10WheelIncentive.amount : 0) +
                              (val.extra6WheelIncentive ? val.extra6WheelIncentive.amount : 0);
        if (Math.abs(val.totalProjectedIncentive - expectedTotal) > 0.01) violations++;
      }
      const passed = violations === 0;
      record(14, "Total (Projected) strictly excludes ineligible standard incentive amounts across all vehicles", passed,
        `Violations count: ${violations}`);
    }

    // 15. Verify duplicate trips, repeated refreshes, and reopening do not duplicate payouts
    {
      const veh = "TEST_REQ15_DUP";
      await createVehicle(veh, "12WH", "ATOA", "Dedicated");
      // Add 6 unique trips
      for (let i = 1; i <= 6; i++) {
        await addTrip(veh, `INV_R15_${i}`, { mt: 10, billing: 100 });
      }
      const resBefore = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);

      // Now add a duplicate of trip 1 with identical invoice number
      await addTrip(veh, `INV_R15_1`, { mt: 10, billing: 100 });

      const resAfter = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);

      const passed = resBefore.qualifyingTripsCount === 6 &&
                     resAfter.qualifyingTripsCount === 6 &&
                     resBefore.standardIncentive.amount === resAfter.standardIncentive.amount;
      record(15, "Duplicate trips deduplicated & repeated calculations remain strictly idempotent", passed,
        `Trips before: ${resBefore.qualifyingTripsCount}, after duplicate: ${resAfter.qualifyingTripsCount}, amount: ${resAfter.standardIncentive.amount}`);
    }

    // 16. Verify legitimate qualifying extra incentives are preserved and calculated independently
    {
      const veh = "TEST_REQ16_6W_6TRIPS";
      await createVehicle(veh, "6WH", "MKT", "Non-Dedicated"); // Non-Dedicated!
      // 6 trips * 950 Party Freight = 5,700 -> 15% 6WH extra = 855
      for (let i = 1; i <= 6; i++) {
        await addTrip(veh, `INV_R16_${i}`, { mt: 10, partyRate: 95 });
      }
      const res = await evaluateVehicleIncentiveEligibility(veh, TEST_MONTH, TEST_YEAR);
      const passed = res.standardIncentive.eligible === false &&
                     res.standardIncentive.amount === 0 &&
                     res.extra6WheelIncentive.eligible === true &&
                     res.extra6WheelIncentive.amount === 855 &&
                     res.totalProjectedIncentive === 855;
      record(16, "Legitimate qualifying extra incentives (e.g. 6W Extra 15%) preserved independently for Non-Dedicated", passed,
        `standard=${res.standardIncentive.amount}, extra6W=${res.extra6WheelIncentive.amount}, totalProjected=${res.totalProjectedIncentive}`);
    }

  } finally {
    // Cleanup test data
    for (const veh of testVehicles) {
      await ownerCol.deleteMany({ "Truck No": veh });
      await entriesCol.deleteMany({ "VEHICLE NUMBER": veh, month: TEST_MONTH, year: TEST_YEAR });
    }
    await mongoose.disconnect();
  }

  console.log("\n========================================================================");
  const totalPassed = results.filter(r => r.passed).length;
  console.log(`SUMMARY: ${totalPassed} / ${results.length} ACCEPTANCE TESTS PASSED`);
  console.log("========================================================================");

  if (totalPassed === results.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
