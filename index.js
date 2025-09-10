require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ----------------- MYSQL CONNECTION -----------------
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0
});

// ----------------- AUTH ROUTES -----------------
app.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;
    if (!fullName || !email || !password) return res.json({ success: false, message: 'Missing fields' });

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.json({ success: false, message: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    await pool.execute('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [fullName, email, hash]);

    const userId = '@' + fullName.replace(/\s+/g, '');
    res.json({ success: true, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Register failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.json({ success: false, message: 'Missing fields' });

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.json({ success: false, message: 'User not found' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.json({ success: false, message: 'Incorrect password' });

    const userId = '@' + user.full_name.replace(/\s+/g, '');
    res.json({ success: true, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
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

// ----------------- HEALTH ENDPOINTS -----------------
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

      if (ep === 'heart') await saveHeartData(userId, deviceName, data);
      else if (ep === 'sleep') await saveSleepData(userId, deviceName, data);
      else if (ep === 'activity') await saveActivityData(userId, deviceName, data);
      else if (ep === 'body') await saveBodyData(userId, deviceName, data);
      else if (ep === 'vitals') await saveVitalsData(userId, deviceName, data);
      else if (ep === 'health') await saveHealthData(userId, deviceName, data);
      else if (ep === 'health_history') await saveHealthHistoryData(userId, deviceName, data);

      res.json({ success: true, endpoint: ep });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      conn.release();
    }
  });
});

// ----------------- GET RAW DATA -----------------
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

// ----------------- CATCH-ALL ROUTE -----------------
app.all('*', (req, res) => {
  res.status(404).json({ error: 'Route not found', method: req.method, url: req.url });
});

// ----------------- START SERVER -----------------
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
