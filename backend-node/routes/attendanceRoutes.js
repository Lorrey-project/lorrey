const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const Site = require("../models/Site");
const Attendance = require("../models/Attendance");
const AttendanceAuditLog = require("../models/AttendanceAuditLog");
const User = require("../models/User");
const AttendanceSetting = require("../models/AttendanceSetting");
const Holiday = require("../models/Holiday");

// Seed default sites helper
async function seedDefaultSites() {
    try {
        // Remove old sites to avoid mismatch
        await Site.deleteMany({
            siteName: { $in: ["Sonthalia Auto Service (SAS-1)", "Sonthalia Auto Service (SAS-2)", "Head Office"] }
        });

        const defaultSites = [
            {
                siteName: "Office",
                latitude: 23.45401457278988,
                longitude: 87.44537408071466,
                geofenceRadius: 100,
                maxGpsAccuracy: 250
            },
            {
                siteName: "Raj House",
                latitude: 22.73359230270436,
                longitude: 87.34229223812619,
                geofenceRadius: 100,
                maxGpsAccuracy: 250
            },
            {
                siteName: "Som House",
                latitude: 23.673127177268128,
                longitude: 86.96936630940948,
                geofenceRadius: 100,
                maxGpsAccuracy: 250
            }
        ];

        for (const ds of defaultSites) {
            await Site.findOneAndUpdate(
                { siteName: ds.siteName },
                ds,
                { upsert: true, new: true }
            );
        }
        console.log("Ensured default attendance sites are seeded.");
    } catch (e) {
        console.error("Failed to seed default sites:", e);
    }
}

async function seedDefaultSettings() {
    try {
        const count = await AttendanceSetting.countDocuments();
        if (count === 0) {
            await AttendanceSetting.create({
                officeStartTime: "09:30",
                gracePeriodMinutes: 15,
                officeEndTime: "17:30",
                earlyCheckoutThreshold: "17:15"
            });
            console.log("Ensured default attendance settings are seeded.");
        }
    } catch (e) {
        console.error("Failed to seed default settings:", e);
    }
}

async function seedDefaultHolidays() {
    try {
        const defaultHolidays = [
            { name: "New Year's Day", date: "2026-01-01" },
            { name: "Saraswati Puja", date: "2026-02-02" },
            { name: "Holi / Dol Jatra", date: "2026-03-03" },
            { name: "Bengali New Year / Nababarsha", date: "2026-04-14" },
            { name: "15th August - Independence Day", date: "2026-08-15" },
            { name: "Mahasaptami - Durgapuja", date: "2026-10-17" },
            { name: "Mahaashtami - Durgapuja", date: "2026-10-18" },
            { name: "Mahanavami - Durgapuja", date: "2026-10-19" },
            { name: "Vijayadashami - Durgapuja", date: "2026-10-20" },
            { name: "Laxmi Puja", date: "2026-10-24" },
            { name: "Kali Puja / Diwali", date: "2026-11-08" },
            { name: "Bhai Dooj / Bhaifota", date: "2026-11-10" },
            { name: "X-Mass Day", date: "2026-12-25" }
        ];

        for (const dh of defaultHolidays) {
            await Holiday.findOneAndUpdate(
                { date: dh.date },
                dh,
                { upsert: true, new: true }
            );
        }
        console.log("Ensured default office holidays are seeded.");
    } catch (e) {
        console.error("Failed to seed default holidays:", e);
    }
}

async function getAttendanceSettings() {
    let settings = await AttendanceSetting.findOne();
    if (!settings) {
        settings = await AttendanceSetting.create({});
    }
    return settings;
}

async function isHolidayOrSunday(dateStr) {
    const dateObj = new Date(dateStr + "T00:00:00Z");
    if (dateObj.getUTCDay() === 0) {
        return { isSunday: true, isHoliday: false };
    }
    const holiday = await Holiday.findOne({ date: dateStr });
    if (holiday) {
        return { isSunday: false, isHoliday: true, holidayName: holiday.name };
    }
    return { isSunday: false, isHoliday: false };
}

async function calculateCheckInStatus(checkInTime, dateStr) {
    const { isSunday, isHoliday } = await isHolidayOrSunday(dateStr);
    if (isSunday) return "WEEKLY_OFF";
    if (isHoliday) return "HOLIDAY";

    const settings = await getAttendanceSettings();
    const [startHour, startMin] = settings.officeStartTime.split(":").map(Number);
    const graceMinutes = settings.gracePeriodMinutes;

    const utc = checkInTime.getTime() + (checkInTime.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeInMins = hours * 60 + minutes;

    const startTimeMins = startHour * 60 + startMin;
    const graceEndMins = startTimeMins + graceMinutes;

    if (timeInMins <= startTimeMins) {
        return "ON TIME";
    } else if (timeInMins <= graceEndMins) {
        return "GRACE PERIOD";
    } else {
        return "LATE";
    }
}

async function calculateCheckOutStatus(checkOutTime, dateStr) {
    if (!checkOutTime) return null;
    const { isSunday, isHoliday } = await isHolidayOrSunday(dateStr);
    if (isSunday) return "WEEKLY_OFF";
    if (isHoliday) return "HOLIDAY";

    const settings = await getAttendanceSettings();
    const [thresholdHour, thresholdMin] = settings.earlyCheckoutThreshold.split(":").map(Number);

    const utc = checkOutTime.getTime() + (checkOutTime.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeInMins = hours * 60 + minutes;

    const thresholdMins = thresholdHour * 60 + thresholdMin;

    if (timeInMins < thresholdMins) {
        return "EARLY CHECKOUT";
    } else {
        return "NORMAL CHECKOUT";
    }
}



// Trigger seeding immediately on route load if not in test environment
if (process.env.NODE_ENV !== "test") {
    seedDefaultSites();
    seedDefaultSettings();
    seedDefaultHolidays();
}

// Distance calculation: Haversine formula
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
}

// Helper to get date string in IST timezone (UTC+5:30)
function getISTDateString() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));
    return istDate.toISOString().split('T')[0];
}

// Resolve user's assigned site
async function resolveUserSite(userDoc) {
    // 1. Check if site is explicitly assigned
    if (userDoc.assignedSite) {
        const site = await Site.findById(userDoc.assignedSite);
        if (site) return site;
    }
    // 2. Otherwise auto-map based on role and pumpName
    let searchName = "";
    if (userDoc.role === "PETROL PUMP") {
        if (userDoc.pumpName === "SAS-1") {
            searchName = "Sonthalia Auto Service (SAS-1)";
        } else if (userDoc.pumpName === "SAS-2") {
            searchName = "Sonthalia Auto Service (SAS-2)";
        }
    } else if (userDoc.role === "OFFICE" || userDoc.role === "HEAD_OFFICE") {
        searchName = "Head Office";
    }

    if (searchName) {
        const site = await Site.findOne({ siteName: searchName });
        if (site) return site;
    }
    return null;
}

// POST /attendance/check-in
router.post("/check-in", auth, async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const { selectedLocationId, selectedLocationName, latitude, longitude, accuracy } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const deviceInfo = req.headers['user-agent'] || '';
    console.log("[BACKEND RECEIVED PAYLOAD /check-in]", {
        selectedLocationId,
        selectedLocationName,
        latitude,
        longitude,
        accuracy
    });

    try {
        const userDoc = await User.findById(userId);
        if (!userDoc) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // 1. Resolve site from selected location dropdown
        let site = null;
        if (selectedLocationId) {
            site = await Site.findById(selectedLocationId);
        } else if (selectedLocationName) {
            site = await Site.findOne({ siteName: selectedLocationName });
        }

        if (!site) {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "NO_SITE_SELECTED",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "Please select an attendance location." });
        }

        // Validate that it's one of the official locations
        if (site.siteName !== "Office" && site.siteName !== "Raj House" && site.siteName !== "Som House") {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "INVALID_SITE_SELECTED",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "Invalid attendance location selected." });
        }

        // 2. Validate GPS coordinates
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        const accNum = parseFloat(accuracy);

        if (isNaN(latNum) || isNaN(lonNum) || latitude === null || longitude === null || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "INVALID_COORDINATES",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "Unable to determine your current location." });
        }

        // 3. Validate GPS accuracy
        const maxGpsAccuracy = site.maxGpsAccuracy || 250;
        if (isNaN(accNum) || accNum === null || accNum < 0 || accNum > maxGpsAccuracy) {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "GPS_ACCURACY_TOO_LOW",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "GPS accuracy is too low. Please move to an open area and try again." });
        }

        // 4. Calculate Distance and Geofence
        const distance = getHaversineDistance(latNum, lonNum, site.latitude, site.longitude);
        const geofenceRadius = site.geofenceRadius || 100;
        if (distance > geofenceRadius) {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "OUTSIDE_GEOFENCE",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "You are outside the allowed attendance location." });
        }

        // 5. Check Duplicate Check-In
        const dateStr = getISTDateString();
        const existingAttendance = await Attendance.findOne({ employeeId: userId, date: dateStr });
        if (existingAttendance) {
            await AttendanceAuditLog.create({
                employeeId: userId,
                action: "CHECK_IN_REJECTED",
                performedBy: userId,
                reason: "DUPLICATE_CHECK_IN",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "You have already checked in today." });
        }

        // 6. Save Check-In
        const now = new Date();
        const checkInStatus = await calculateCheckInStatus(now, dateStr);
        const newAttendance = new Attendance({
            employeeId: userId,
            siteId: site._id,
            selectedLocationId: site._id,
            selectedLocationName: site.siteName,
            date: dateStr,
            checkIn: {
                time: now,
                latitude: latNum,
                longitude: lonNum,
                accuracy: accNum,
                distanceFromSite: distance,
                geofenceRadius: geofenceRadius,
                validationStatus: "VALIDATED"
            },
            status: "checked-in",
            checkInStatus: checkInStatus
        });

        await newAttendance.save();

        // 7. Audit log
        await AttendanceAuditLog.create({
            attendanceId: newAttendance._id,
            employeeId: userId,
            action: "CHECK_IN_SUCCESS",
            newValue: {
                location: site.siteName,
                distance: `${Math.round(distance)}m`,
                accuracy: `${Math.round(accNum)}m`
            },
            performedBy: userId,
            ipAddress,
            deviceInfo
        });

        res.json({ success: true, message: "Check-in successful.", attendance: newAttendance });

    } catch (err) {
        console.error("Check-in error:", err);
        res.status(500).json({ success: false, error: "Server error during check-in" });
    }
});

// POST /attendance/check-out
router.post("/check-out", auth, async (req, res) => {
    const userId = req.user.userId || req.user.id;
    const { latitude, longitude, accuracy } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const deviceInfo = req.headers['user-agent'] || '';
    console.log("[BACKEND RECEIVED PAYLOAD /check-out]", {
        latitude,
        longitude,
        accuracy
    });

    try {
        const userDoc = await User.findById(userId);
        if (!userDoc) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // 1. Find existing active check-in
        const dateStr = getISTDateString();
        const attendance = await Attendance.findOne({ employeeId: userId, date: dateStr, status: "checked-in" });
        if (!attendance) {
            return res.status(400).json({ success: false, error: "You must check in before checking out." });
        }

        // 2. Resolve site
        const site = await Site.findById(attendance.siteId);
        if (!site) {
            await AttendanceAuditLog.create({
                attendanceId: attendance._id,
                employeeId: userId,
                action: "CHECK_OUT_REJECTED",
                performedBy: userId,
                reason: "NO_ASSIGNED_SITE",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "No attendance location has been assigned to your account." });
        }

        // 3. Validate GPS coordinates
        const latNum = parseFloat(latitude);
        const lonNum = parseFloat(longitude);
        const accNum = parseFloat(accuracy);

        if (isNaN(latNum) || isNaN(lonNum) || latitude === null || longitude === null || latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) {
            await AttendanceAuditLog.create({
                attendanceId: attendance._id,
                employeeId: userId,
                action: "CHECK_OUT_REJECTED",
                performedBy: userId,
                reason: "INVALID_COORDINATES",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "Unable to determine your current location." });
        }

        // 4. Validate GPS accuracy
        const maxGpsAccuracy = site.maxGpsAccuracy || 250;
        if (isNaN(accNum) || accNum === null || accNum < 0 || accNum > maxGpsAccuracy) {
            await AttendanceAuditLog.create({
                attendanceId: attendance._id,
                employeeId: userId,
                action: "CHECK_OUT_REJECTED",
                performedBy: userId,
                reason: "GPS_ACCURACY_TOO_LOW",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "GPS accuracy is too low. Please move to an open area and try again." });
        }

        // 5. Calculate Distance and Geofence
        const distance = getHaversineDistance(latNum, lonNum, site.latitude, site.longitude);
        if (distance > site.geofenceRadius) {
            await AttendanceAuditLog.create({
                attendanceId: attendance._id,
                employeeId: userId,
                action: "CHECK_OUT_REJECTED",
                performedBy: userId,
                reason: "OUTSIDE_GEOFENCE",
                ipAddress,
                deviceInfo
            });
            return res.status(400).json({ success: false, error: "You are outside the allowed attendance location." });
        }

        // 6. Save Check-Out
        const now = new Date();
        const checkOutStatus = await calculateCheckOutStatus(now, dateStr);
        attendance.checkOut = {
            time: now,
            latitude: latNum,
            longitude: lonNum,
            accuracy: accNum,
            distanceFromSite: distance,
            geofenceRadius: site.geofenceRadius,
            validationStatus: "VALIDATED"
        };
        attendance.status = "checked-out";
        attendance.checkOutStatus = checkOutStatus;
        await attendance.save();

        // 7. Audit log
        await AttendanceAuditLog.create({
            attendanceId: attendance._id,
            employeeId: userId,
            action: "CHECK_OUT_SUCCESS",
            newValue: {
                location: site.siteName,
                distance: `${Math.round(distance)}m`,
                accuracy: `${Math.round(accNum)}m`
            },
            performedBy: userId,
            ipAddress,
            deviceInfo
        });

        res.json({ success: true, message: "Check-out successful.", attendance });

    } catch (err) {
        res.status(500).json({ success: false, error: "Server error during check-out" });
    }
});

// GET /attendance/my
router.get("/my", auth, async (req, res) => {
    const userId = req.user.userId || req.user.id;
    try {
        const dateStr = getISTDateString();
        const todayAttendance = await Attendance.findOne({ employeeId: userId, date: dateStr })
            .populate("siteId", "siteName latitude longitude geofenceRadius maxGpsAccuracy")
            .lean();

        const history = await Attendance.find({ employeeId: userId })
            .populate("siteId", "siteName")
            .sort({ date: -1 })
            .limit(30)
            .lean();

        const userDoc = await User.findById(userId);
        const resolvedSite = await resolveUserSite(userDoc);

        res.json({
            success: true,
            today: todayAttendance,
            history,
            assignedSite: resolvedSite ? {
                _id: resolvedSite._id,
                siteName: resolvedSite.siteName,
                latitude: resolvedSite.latitude,
                longitude: resolvedSite.longitude,
                geofenceRadius: resolvedSite.geofenceRadius,
                maxGpsAccuracy: resolvedSite.maxGpsAccuracy
            } : null
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /attendance/audit
router.get("/audit", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    try {
        const logs = await AttendanceAuditLog.find()
            .populate("employeeId", "name email role")
            .populate("performedBy", "name email role")
            .populate({
                path: "attendanceId",
                populate: { path: "siteId", select: "siteName" }
            })
            .sort({ timestamp: -1 })
            .limit(100)
            .lean();

        res.json({ success: true, logs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /attendance/history
router.get("/history", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    try {
        const history = await Attendance.find()
            .populate("employeeId", "name email role pumpName")
            .populate("siteId", "siteName")
            .sort({ date: -1, createdAt: -1 })
            .lean();

        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /attendance/correct
router.post("/correct", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    const { attendanceId, checkInTime, checkOutTime, status, siteId, reason } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const deviceInfo = req.headers['user-agent'] || '';
    const adminId = req.user.userId || req.user.id;

    if (!attendanceId) {
        return res.status(400).json({ success: false, error: "Attendance record ID is required." });
    }
    if (!reason) {
        return res.status(400).json({ success: false, error: "Reason for correction is required." });
    }

    try {
        const attendance = await Attendance.findById(attendanceId);
        if (!attendance) {
            return res.status(404).json({ success: false, error: "Attendance record not found." });
        }

        const oldSite = await Site.findById(attendance.siteId);
        const previousValue = {
            checkInTime: attendance.checkIn ? attendance.checkIn.time : null,
            checkOutTime: attendance.checkOut ? attendance.checkOut.time : null,
            status: attendance.status,
            siteName: oldSite ? oldSite.siteName : (attendance.selectedLocationName || "N/A")
        };

        const newValue = {};

        if (siteId) {
            const newSite = await Site.findById(siteId);
            if (!newSite) {
                return res.status(404).json({ success: false, error: "New site/location not found." });
            }
            attendance.siteId = newSite._id;
            attendance.selectedLocationId = newSite._id;
            attendance.selectedLocationName = newSite.siteName;
            newValue.siteName = newSite.siteName;
        }

        if (checkInTime !== undefined) {
            if (!attendance.checkIn) {
                attendance.checkIn = {
                    time: checkInTime ? new Date(checkInTime) : new Date(),
                    latitude: 0,
                    longitude: 0,
                    accuracy: 0,
                    distanceFromSite: 0,
                    geofenceRadius: 0,
                    validationStatus: "MANUAL_BY_ADMIN"
                };
            } else {
                attendance.checkIn.time = checkInTime ? new Date(checkInTime) : null;
            }
            if (attendance.checkIn && attendance.checkIn.time) {
                attendance.checkInStatus = await calculateCheckInStatus(attendance.checkIn.time, attendance.date);
            } else {
                attendance.checkInStatus = null;
            }
            newValue.checkInTime = checkInTime;
        }

        if (checkOutTime !== undefined) {
            if (checkOutTime === null) {
                attendance.checkOut = null;
                attendance.checkOutStatus = null;
            } else {
                if (!attendance.checkOut) {
                    attendance.checkOut = {
                        time: new Date(checkOutTime),
                        latitude: 0,
                        longitude: 0,
                        accuracy: 0,
                        distanceFromSite: 0,
                        geofenceRadius: 0,
                        validationStatus: "MANUAL_BY_ADMIN"
                    };
                } else {
                    attendance.checkOut.time = new Date(checkOutTime);
                }
                attendance.checkOutStatus = await calculateCheckOutStatus(attendance.checkOut.time, attendance.date);
            }
            newValue.checkOutTime = checkOutTime;
        }

        if (status !== undefined) {
            attendance.status = status;
            newValue.status = status;
        }

        await attendance.save();

        await AttendanceAuditLog.create({
            attendanceId: attendance._id,
            employeeId: attendance.employeeId,
            action: "ADMIN_CORRECTED",
            previousValue,
            newValue,
            performedBy: adminId,
            reason,
            ipAddress,
            deviceInfo
        });

        res.json({ success: true, message: "Attendance corrected successfully.", attendance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /attendance/create-manual
router.post("/create-manual", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    const { employeeId, siteId, date, checkInTime, checkOutTime, reason } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const deviceInfo = req.headers['user-agent'] || '';
    const adminId = req.user.userId || req.user.id;

    if (!employeeId || !siteId || !date || !checkInTime || !reason) {
        return res.status(400).json({ success: false, error: "Missing required fields." });
    }

    try {
        const existing = await Attendance.findOne({ employeeId, date });
        if (existing) {
            return res.status(400).json({ success: false, error: "Attendance record already exists for this employee on this date." });
        }

        const site = await Site.findById(siteId);
        if (!site) {
            return res.status(404).json({ success: false, error: "Site not found" });
        }

        const checkInStatus = await calculateCheckInStatus(new Date(checkInTime), date);
        const newAttendance = new Attendance({
            employeeId,
            siteId,
            date,
            checkIn: {
                time: new Date(checkInTime),
                latitude: site.latitude,
                longitude: site.longitude,
                accuracy: 0,
                distanceFromSite: 0,
                geofenceRadius: site.geofenceRadius,
                validationStatus: "MANUAL_BY_ADMIN"
            },
            status: checkOutTime ? "checked-out" : "checked-in",
            checkInStatus: checkInStatus
        });

        if (checkOutTime) {
            const checkOutStatus = await calculateCheckOutStatus(new Date(checkOutTime), date);
            newAttendance.checkOut = {
                time: new Date(checkOutTime),
                latitude: site.latitude,
                longitude: site.longitude,
                accuracy: 0,
                distanceFromSite: 0,
                geofenceRadius: site.geofenceRadius,
                validationStatus: "MANUAL_BY_ADMIN"
            };
            newAttendance.checkOutStatus = checkOutStatus;
        }

        await newAttendance.save();

        await AttendanceAuditLog.create({
            attendanceId: newAttendance._id,
            employeeId,
            action: "ADMIN_CREATED",
            newValue: {
                date,
                checkInTime,
                checkOutTime,
                siteName: site.siteName
            },
            performedBy: adminId,
            reason,
            ipAddress,
            deviceInfo
        });

        res.json({ success: true, message: "Attendance created manually.", attendance: newAttendance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /attendance/delete/:id
router.delete("/delete/:id", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    const attendanceId = req.params.id;
    const { reason } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const deviceInfo = req.headers['user-agent'] || '';
    const adminId = req.user.userId || req.user.id;

    if (!reason) {
        return res.status(400).json({ success: false, error: "Reason for deletion is required." });
    }

    try {
        const attendance = await Attendance.findById(attendanceId);
        if (!attendance) {
            return res.status(404).json({ success: false, error: "Attendance record not found." });
        }

        await Attendance.findByIdAndDelete(attendanceId);

        await AttendanceAuditLog.create({
            employeeId: attendance.employeeId,
            action: "ADMIN_DELETED",
            previousValue: {
                date: attendance.date,
                checkIn: attendance.checkIn,
                checkOut: attendance.checkOut,
                status: attendance.status
            },
            performedBy: adminId,
            reason,
            ipAddress,
            deviceInfo
        });

        res.json({ success: true, message: "Attendance record deleted successfully." });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /attendance/sites (Helper to populate sites dropdown in admin corrections/manual checkins)
router.get("/sites", auth, async (req, res) => {
    try {
        const sites = await Site.find().select("siteName latitude longitude").lean();
        res.json({ success: true, sites });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /attendance/settings
router.get("/settings", auth, async (req, res) => {
    try {
        const settings = await getAttendanceSettings();
        res.json({ success: true, data: settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /attendance/settings
router.put("/settings", auth, async (req, res) => {
    if (req.user.role !== "HEAD_OFFICE") {
        return res.status(403).json({ success: false, error: "Forbidden: Admins only" });
    }

    try {
        const { officeStartTime, gracePeriodMinutes, officeEndTime, earlyCheckoutThreshold } = req.body;
        const settings = await getAttendanceSettings();

        if (officeStartTime !== undefined) settings.officeStartTime = officeStartTime;
        if (gracePeriodMinutes !== undefined) settings.gracePeriodMinutes = Number(gracePeriodMinutes);
        if (officeEndTime !== undefined) settings.officeEndTime = officeEndTime;
        if (earlyCheckoutThreshold !== undefined) settings.earlyCheckoutThreshold = earlyCheckoutThreshold;

        await settings.save();
        res.json({ success: true, message: "Attendance settings updated.", data: settings });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
