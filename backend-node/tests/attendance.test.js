const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const attendanceRoutes = require('../routes/attendanceRoutes');
const User = require('../models/User');
const Site = require('../models/Site');
const Attendance = require('../models/Attendance');
const AttendanceAuditLog = require('../models/AttendanceAuditLog');
const AttendanceSetting = require('../models/AttendanceSetting');
const Holiday = require('../models/Holiday');

const app = express();
app.use(express.json());
app.use('/attendance', attendanceRoutes);

let employeeUser;
let adminUser;
let otherUser;
let officeSite;
let rajHouseSite;
let somHouseSite;
let employeeToken;
let adminToken;
let otherToken;

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

beforeAll(async () => {
  const uri = "mongodb+srv://lorrey0004:lorrey0004@cluster0.pqbigfd.mongodb.net/attendance_test_db?retryWrites=true&w=majority";
  await mongoose.connect(uri);

  // Clear collections for fresh test run
  await User.deleteMany({});
  await Site.deleteMany({});
  await Attendance.deleteMany({});
  await AttendanceAuditLog.deleteMany({});
  await AttendanceSetting.deleteMany({});
  await Holiday.deleteMany({});

  // Seed settings
  await AttendanceSetting.create({
    officeStartTime: "09:30",
    gracePeriodMinutes: 15,
    officeEndTime: "17:30",
    earlyCheckoutThreshold: "17:15"
  });

  // Seed a test holiday
  await Holiday.create({
    name: "Independence Day",
    date: "2026-08-15"
  });

  // Seed sites
  officeSite = await Site.create({
    siteName: "Office",
    latitude: 23.45401457278988,
    longitude: 87.44537408071466,
    geofenceRadius: 100,
    maxGpsAccuracy: 250
  });

  rajHouseSite = await Site.create({
    siteName: "Raj House",
    latitude: 22.73359230270436,
    longitude: 87.34229223812619,
    geofenceRadius: 100,
    maxGpsAccuracy: 250
  });

  somHouseSite = await Site.create({
    siteName: "Som House",
    latitude: 23.673127177268128,
    longitude: 86.96936630940948,
    geofenceRadius: 100,
    maxGpsAccuracy: 250
  });

  // Seed employee user
  employeeUser = await User.create({
    email: "employee@lorrey.com",
    password: "password123",
    role: "PETROL PUMP",
    pumpName: "SAS-1",
    status: "active"
  });
  employeeToken = jwt.sign({ userId: employeeUser._id, role: employeeUser.role, pumpName: employeeUser.pumpName }, JWT_SECRET);

  // Seed admin user
  adminUser = await User.create({
    email: "admin@lorrey.com",
    password: "password123",
    role: "HEAD_OFFICE",
    status: "active"
  });
  adminToken = jwt.sign({ userId: adminUser._id, role: adminUser.role }, JWT_SECRET);

  // Seed user with no assigned site/pumpName
  otherUser = await User.create({
    email: "other@lorrey.com",
    password: "password123",
    role: "PETROL PUMP",
    pumpName: null,
    status: "active"
  });
  otherToken = jwt.sign({ userId: otherUser._id, role: otherUser.role, pumpName: otherUser.pumpName }, JWT_SECRET);
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Attendance.deleteMany({});
  await AttendanceAuditLog.deleteMany({});
});

describe('Location-Based Attendance Security & Validation', () => {
  // Test 1: Employee inside 100m geofence -> Check-In succeeds.
  it('succeeds check-in when employee is inside Office geofence (23.4540, 87.4453 ~ 8m away)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 15
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.status).toBe('checked-in');
    expect(res.body.attendance.selectedLocationName).toBe('Office');
    
    // Assert audit log was written
    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_SUCCESS' });
    expect(logs.length).toBe(1);
    expect(logs[0].employeeId.toString()).toBe(employeeUser._id.toString());
  });

  // Test 2: Employee outside geofence -> Check-In rejected.
  it('rejects check-in when employee is outside Office geofence (24.0000, 88.0000)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 24.0000,
        longitude: 88.0000,
        accuracy: 10
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('outside');
    
    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'OUTSIDE_GEOFENCE' });
    expect(logs.length).toBe(1);
  });

  // Test 3: GPS accuracy within allowed limit -> Validation continues.
  it('accepts check-in when GPS accuracy is within limits (50m <= 100m)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 50
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  // Test 4: GPS accuracy exceeds allowed limit -> Attendance rejected.
  it('rejects check-in when GPS accuracy is too low (300m > 250m)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 300
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('accuracy is too low');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'GPS_ACCURACY_TOO_LOW' });
    expect(logs.length).toBe(1);
  });

  // Test 4b: GPS accuracy is 212m (<= 250m) and distance is 23.1m (<= 100m) -> succeeds.
  it('succeeds check-in when GPS accuracy is 212m and employee is inside Raj House geofence (22.733794, 87.34224)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Raj House",
        latitude: 22.733794,
        longitude: 87.34224,
        accuracy: 212
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.status).toBe('checked-in');
    expect(res.body.attendance.selectedLocationName).toBe('Raj House');
  });

  // Test 5: Employee does not select a location -> Attendance rejected.
  it('rejects check-in when no location is selected', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Please select an attendance location');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'NO_SITE_SELECTED' });
    expect(logs.length).toBe(1);
  });

  // Test 6: Duplicate Check-In -> Rejected.
  it('prevents duplicate check-in on the same day', async () => {
    // First check-in
    await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ selectedLocationName: "Office", latitude: 23.4540, longitude: 87.4453, accuracy: 10 });

    // Second check-in
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ selectedLocationName: "Office", latitude: 23.4540, longitude: 87.4453, accuracy: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already checked in today');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'DUPLICATE_CHECK_IN' });
    expect(logs.length).toBe(1);
  });

  // Test 7: Successful Check-Out -> Check-Out stored.
  it('succeeds check-out within geofence after check-in', async () => {
    // Check-in
    await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ selectedLocationName: "Office", latitude: 23.4540, longitude: 87.4453, accuracy: 10 });

    // Check-out
    const res = await request(app)
      .post('/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ latitude: 23.4540, longitude: 87.4453, accuracy: 15 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.status).toBe('checked-out');
    expect(res.body.attendance.checkOut.accuracy).toBe(15);
  });

  // Test 8: Outside geofence Check-Out -> Rejected.
  it('rejects check-out when employee is outside geofence', async () => {
    // Check-in inside
    await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ selectedLocationName: "Office", latitude: 23.4540, longitude: 87.4453, accuracy: 10 });

    // Check-out outside
    const res = await request(app)
      .post('/attendance/check-out')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ latitude: 24.0000, longitude: 88.0000, accuracy: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('outside');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_OUT_REJECTED', reason: 'OUTSIDE_GEOFENCE' });
    expect(logs.length).toBe(1);
  });

  // Test 9: Admin attendance correction -> Old and new values recorded in audit log.
  it('logs old and new values in audit log when admin corrects attendance location', async () => {
    // Create check-in
    const checkinRes = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({ selectedLocationName: "Office", latitude: 23.4540, longitude: 87.4453, accuracy: 10 });

    const attendanceId = checkinRes.body.attendance._id;
    const newTime = new Date(Date.now() - 3600000).toISOString();

    const res = await request(app)
      .post('/attendance/correct')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        attendanceId,
        checkInTime: newTime,
        status: 'checked-out',
        siteId: rajHouseSite._id,
        reason: 'Employee forgot check-in'
      });

    expect(res.status).toBe(200);
    
    // Find audit log
    const logs = await AttendanceAuditLog.find({ action: 'ADMIN_CORRECTED' });
    expect(logs.length).toBe(1);
    expect(logs[0].reason).toBe('Employee forgot check-in');
    expect(logs[0].previousValue.siteName).toBe('Office');
    expect(logs[0].newValue.siteName).toBe('Raj House');
  });

  // Test 10: Normal employee attempts to modify attendance -> Request rejected by backend.
  it('rejects correction request from normal employee', async () => {
    const res = await request(app)
      .post('/attendance/correct')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        attendanceId: '507f1f77bcf86cd799439011',
        status: 'checked-out',
        reason: 'attempt'
      });

    expect(res.status).toBe(403);
  });

  // Test 11: Normal employee attempts to modify/delete audit log -> Request rejected.
  it('rejects audit log request from normal employee', async () => {
    const res = await request(app)
      .get('/attendance/audit')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
  });

  // Test 12: Frontend sends fake distance/geofence result -> Backend ignores the fake values and recalculates.
  it('ignores client-sent distance or geofence status and recalculates', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10,
        distance: 999999,
        isWithinGeofence: false
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance.checkIn.distanceFromSite).toBeLessThan(15);
  });

  // Test 13: Frontend sends another employeeId -> Backend uses authenticated employee identity instead.
  it('ignores client-sent employeeId and uses authenticated identity', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10,
        employeeId: otherUser._id
      });

    expect(res.status).toBe(200);
    expect(res.body.attendance.employeeId.toString()).toBe(employeeUser._id.toString());
  });

  // Test 14: Frontend sends fake timestamp -> Backend uses server timestamp.
  it('ignores client-sent timestamp and uses server-side time', async () => {
    const fakeTime = new Date('2000-01-01T00:00:00Z');
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10,
        time: fakeTime
      });

    expect(res.status).toBe(200);
    const savedTime = new Date(res.body.attendance.checkIn.time);
    expect(savedTime.getFullYear()).toBe(new Date().getFullYear());
  });

  // Test 15: Cross-location check 1: Select Office -> GPS near Raj House -> Rejected.
  it('rejects check-in when employee selects Office but GPS is near Raj House', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Office",
        latitude: 22.7335,
        longitude: 87.3422,
        accuracy: 10
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('outside');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'OUTSIDE_GEOFENCE' });
    expect(logs.length).toBe(1);
  });

  // Test 16: Cross-location check 2: Select Raj House -> GPS near Office -> Rejected.
  it('rejects check-in when employee selects Raj House but GPS is near Office', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Raj House",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('outside');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'OUTSIDE_GEOFENCE' });
    expect(logs.length).toBe(1);
  });

  it('succeeds check-in when employee is inside Som House geofence (23.6731, 86.9693)', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Som House",
        latitude: 23.673127177268128,
        longitude: 86.96936630940948,
        accuracy: 10
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.status).toBe('checked-in');
    expect(res.body.attendance.selectedLocationName).toBe('Som House');
  });

  it('rejects check-in when employee selects Som House but GPS is near Office', async () => {
    const res = await request(app)
      .post('/attendance/check-in')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        selectedLocationName: "Som House",
        latitude: 23.4540,
        longitude: 87.4453,
        accuracy: 10
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('outside');

    const logs = await AttendanceAuditLog.find({ action: 'CHECK_IN_REJECTED', reason: 'OUTSIDE_GEOFENCE' });
    expect(logs.length).toBe(1);
  });

  describe('Attendance Timing, Grace Period, and Early Checkout Rules via Manual Creation', () => {
    const runCreateManual = async (payload) => {
      return await request(app)
        .post('/attendance/create-manual')
        .set('Authorization', "Bearer " + adminToken)
        .send(payload);
    };

    // CHECK-IN CASES
    it('marks check-in at 09:29 as ON TIME', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24", // Monday
        checkInTime: "2026-08-24T09:29:00",
        reason: "Test 09:29"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("ON TIME");
    });

    it('marks check-in at 09:30 as ON TIME', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:30:00",
        reason: "Test 09:30"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("ON TIME");
    });

    it('marks check-in at 09:31 as GRACE PERIOD', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:31:00",
        reason: "Test 09:31"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("GRACE PERIOD");
    });

    it('marks check-in at 09:40 as GRACE PERIOD', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:40:00",
        reason: "Test 09:40"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("GRACE PERIOD");
    });

    it('marks check-in at 09:45 as GRACE PERIOD', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:45:00",
        reason: "Test 09:45"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("GRACE PERIOD");
    });

    it('marks check-in at 09:46 as LATE', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:46:00",
        reason: "Test 09:46"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("LATE");
    });

    it('marks check-in at 10:00 as LATE', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T10:00:00",
        reason: "Test 10:00"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("LATE");
    });

    // CHECK-OUT CASES
    it('marks check-out at 17:14 as EARLY CHECKOUT', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:00:00",
        checkOutTime: "2026-08-24T17:14:00",
        reason: "Test 17:14"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkOutStatus).toBe("EARLY CHECKOUT");
    });

    it('marks check-out at 17:15 as NORMAL CHECKOUT', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:00:00",
        checkOutTime: "2026-08-24T17:15:00",
        reason: "Test 17:15"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkOutStatus).toBe("NORMAL CHECKOUT");
    });

    it('marks check-out at 17:20 as NORMAL CHECKOUT', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:00:00",
        checkOutTime: "2026-08-24T17:20:00",
        reason: "Test 17:20"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkOutStatus).toBe("NORMAL CHECKOUT");
    });

    it('marks check-out at 17:30 as NORMAL CHECKOUT', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T09:00:00",
        checkOutTime: "2026-08-24T17:30:00",
        reason: "Test 17:30"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkOutStatus).toBe("NORMAL CHECKOUT");
    });

    // SUNDAY & HOLIDAY CASES
    it('marks Sunday check-in and check-out as WEEKLY_OFF', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-23", // Sunday
        checkInTime: "2026-08-23T10:00:00",
        checkOutTime: "2026-08-23T15:00:00",
        reason: "Test Sunday"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("WEEKLY_OFF");
      expect(res.body.attendance.checkOutStatus).toBe("WEEKLY_OFF");
    });

    it('marks Allocated Holiday check-in and check-out as HOLIDAY', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-15", // Independence Day (seeded holiday)
        checkInTime: "2026-08-15T10:00:00",
        checkOutTime: "2026-08-15T15:00:00",
        reason: "Test Holiday"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("HOLIDAY");
      expect(res.body.attendance.checkOutStatus).toBe("HOLIDAY");
    });

    // LATE AND EARLY CHECKOUT COMBINATION
    it('preserves both LATE check-in and EARLY CHECKOUT status', async () => {
      const res = await runCreateManual({
        employeeId: employeeUser._id,
        siteId: officeSite._id,
        date: "2026-08-24",
        checkInTime: "2026-08-24T10:00:00", // Late (start: 09:30, grace: 15m)
        checkOutTime: "2026-08-24T17:00:00", // Early checkout (threshold: 17:15)
        reason: "Test Combination"
      });
      expect(res.status).toBe(200);
      expect(res.body.attendance.checkInStatus).toBe("LATE");
      expect(res.body.attendance.checkOutStatus).toBe("EARLY CHECKOUT");
    });
  });
});