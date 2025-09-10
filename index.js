require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const authRouter = require('./auth'); // your auth.js file

const app = express();
app.use(express.json());

// ----------------- CONFIG -----------------
const PORT = process.env.PORT || 3000;

// MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
    queueLimit: 0
});

// ----------------- HELPER FUNCTIONS -----------------

async function saveRawData(userId, deviceName, endpoint, data, dayLabel = null) {
    const conn = await pool.getConnection();
    try {
        await conn.execute(
            `INSERT INTO device_data (user_id, device_name, endpoint, data, day_label) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, endpoint, JSON.stringify(data), dayLabel]
        );
    } finally {
        conn.release();
    }
}

async function saveHeartData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { currentHeartRate = null, restingHeartRate = null, hrv = null } = data;
        await conn.execute(
            `INSERT INTO heart_data (user_id, device_name, current_heart_rate, resting_heart_rate, hrv) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, currentHeartRate, restingHeartRate, hrv]
        );
    } finally {
        conn.release();
    }
}

async function saveSleepData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { totalSleep = null, deepSleep = null, remSleep = null } = data;
        await conn.execute(
            `INSERT INTO sleep_data (user_id, device_name, total_sleep, deep_sleep, rem_sleep) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, totalSleep, deepSleep, remSleep]
        );
    } finally {
        conn.release();
    }
}

async function saveActivityData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { steps = null, calories = null, distance = null } = data;
        await conn.execute(
            `INSERT INTO activity_data (user_id, device_name, steps, calories, distance) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, steps, calories, distance]
        );
    } finally {
        conn.release();
    }
}

async function saveBodyData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { weight = null, bmi = null, bodyFat = null } = data;
        await conn.execute(
            `INSERT INTO body_data (user_id, device_name, weight, bmi, body_fat) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, weight, bmi, bodyFat]
        );
    } finally {
        conn.release();
    }
}

async function saveVitalsData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { bloodPressureSystolic = null, bloodPressureDiastolic = null, spo2 = null, temperature = null } = data;
        await conn.execute(
            `INSERT INTO vitals_data (user_id, device_name, bp_systolic, bp_diastolic, spo2, temperature) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, deviceName, bloodPressureSystolic, bloodPressureDiastolic, spo2, temperature]
        );
    } finally {
        conn.release();
    }
}

async function saveHealthData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { condition = null, allergies = null, medications = null } = data;
        await conn.execute(
            `INSERT INTO health_data (user_id, device_name, condition, allergies, medications) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, condition, allergies, medications]
        );
    } finally {
        conn.release();
    }
}

async function saveHealthHistoryData(userId, deviceName, data) {
    const conn = await pool.getConnection();
    try {
        const { pastConditions = null, surgeries = null, familyHistory = null } = data;
        await conn.execute(
            `INSERT INTO health_history_data (user_id, device_name, past_conditions, surgeries, family_history) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, deviceName, pastConditions, surgeries, familyHistory]
        );
    } finally {
        conn.release();
    }
}

// ----------------- ENDPOINTS -----------------
const endpoints = ['activity', 'heart', 'sleep', 'body', 'vitals', 'health', 'health_history'];

endpoints.forEach(ep => {
    app.post(`/${ep}`, async (req, res) => {
        const conn = await pool.getConnection();
        try {
            const userId = req.body.userId || null;
            const deviceName = req.body.deviceName || 'UnknownDevice';
            const data = req.body.data || req.body;
            const dayLabel = req.body.day || null;

            await saveRawData(userId, deviceName, ep, data, dayLabel);

            switch (ep) {
                case 'heart': await saveHeartData(userId, deviceName, data); break;
                case 'sleep': await saveSleepData(userId, deviceName, data); break;
                case 'activity': await saveActivityData(userId, deviceName, data); break;
                case 'body': await saveBodyData(userId, deviceName, data); break;
                case 'vitals': await saveVitalsData(userId, deviceName, data); break;
                case 'health': await saveHealthData(userId, deviceName, data); break;
                case 'health_history': await saveHealthHistoryData(userId, deviceName, data); break;
            }

            res.json({ success: true, endpoint: ep });
        } catch (err) {
            console.error(err);
            res.status(500).json({ success: false, error: err.message });
        } finally {
            conn.release();
        }
    });
});

// GET raw logs
app.get('/:endpoint/:deviceName', async (req, res) => {
    try {
        const { endpoint, deviceName } = req.params;
        const [rows] = await pool.execute(
            `SELECT * FROM device_data WHERE device_name=? AND endpoint=? ORDER BY created_at DESC`,
            [deviceName, endpoint]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------- MOUNT AUTH -----------------
app.use('/', authRouter); // /register and /login

// ----------------- START SERVER -----------------
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
