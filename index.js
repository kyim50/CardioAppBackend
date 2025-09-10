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
    if (!fullName || !email || !password)
      return res.json({ success: false, message: 'Missing fields' });

    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0)
      return res.json({ success: false, message: 'Email already registered', userId: existing[0].id.toString() });

    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [fullName, email, hash]
    );

    const userId = result.insertId.toString();
    res.json({ success: true, message: "Registered successfully", userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Register failed' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.json({ success: false, message: 'Missing fields' });

    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.json({ success: false, message: 'User not found' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.json({ success: false, message: 'Incorrect password' });

    const userId = user.id.toString();
    res.json({ success: true, message: "Login successful", userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ----------------- HELPER FUNCTIONS -----------------

// Generic deduplication helper
async function saveUniqueData(table, userId, deviceName, columns, values) {
  const conn = await pool.getConnection();
  try {
    const whereParts = ['user_id=?', 'device_name=?'];
    const whereValues = [userId, deviceName];

    columns.forEach((col, idx) => {
      whereParts.push(`${col}=?`);
      whereValues.push(values[idx]);
    });

    const [existing] = await conn.execute(
      `SELECT id FROM ${table} WHERE ${whereParts.join(' AND ')} LIMIT 1`,
      whereValues
    );

    if (existing.length === 0) {
      await conn.execute(
        `INSERT INTO ${table} (${['user_id', 'device_name', ...columns].join(', ')}) VALUES (${new Array(2 + columns.length).fill('?').join(', ')})`,
        [userId, deviceName, ...values]
      );
    } else {
      console.log(`Skipped duplicate insert in ${table} for user ${userId}`);
    }
  } finally {
    conn.release();
  }
}

// ----------------- SAVE FUNCTIONS -----------------

// Save raw device data (deduplicate by exact JSON)
async function saveRawData(userId, deviceName, endpoint, data, dayLabel = null) {
  await saveUniqueData(
    'device_data',
    userId,
    deviceName,
    ['endpoint', 'data', 'day_label'],
    [endpoint, JSON.stringify(data), dayLabel]
  );
}

async function saveHeartData(userId, deviceName, data) {
  const { currentHeartRate = 0, restingHeartRate = 0, hrv = 0 } = data;
  await saveUniqueData(
    'heart_data',
    userId,
    deviceName,
    ['current_heart_rate', 'resting_heart_rate', 'hrv'],
    [currentHeartRate, restingHeartRate, hrv]
  );
}

async function saveSleepData(userId, deviceName, data) {
  const { totalSleep = 0, deepSleep = 0, remSleep = 0, sleepHours = 0 } = data;
  await saveUniqueData(
    'sleep_data',
    userId,
    deviceName,
    ['total_sleep', 'deep_sleep', 'rem_sleep', 'sleep_hours'],
    [totalSleep, deepSleep, remSleep, sleepHours]
  );
}

async function saveActivityData(userId, deviceName, data) {
  const { steps = 0, calories = 0, distance = 0, exerciseMinutes = 0 } = data;
  await saveUniqueData(
    'activity_data',
    userId,
    deviceName,
    ['steps', 'calories', 'distance', 'exercise_minutes'],
    [steps, calories, distance, exerciseMinutes]
  );
}

async function saveBodyData(userId, deviceName, data) {
  const { weight = 0, bmi = 0, bodyFat = 0, leanMass = 0, vo2Max = 0 } = data;
  await saveUniqueData(
    'body_data',
    userId,
    deviceName,
    ['weight', 'bmi', 'body_fat', 'lean_mass', 'vo2_max'],
    [weight, bmi, bodyFat, leanMass, vo2Max]
  );
}

async function saveVitalsData(userId, deviceName, data) {
  const { bloodPressureSystolic = 0, bloodPressureDiastolic = 0, spo2 = 0, temperature = 0 } = data;
  await saveUniqueData(
    'vitals_data',
    userId,
    deviceName,
    ['bp_systolic', 'bp_diastolic', 'spo2', 'temperature'],
    [bloodPressureSystolic, bloodPressureDiastolic, spo2, temperature]
  );
}

async function saveHealthData(userId, deviceName, data) {
  const { condition = null, allergies = null, medications = null } = data;
  await saveUniqueData(
    'health_data',
    userId,
    deviceName,
    ['`condition`', 'allergies', 'medications'],
    [condition, allergies, medications]
  );
}

async function saveHealthHistoryData(userId, deviceName, data) {
  const { pastConditions = null, surgeries = null, familyHistory = null, history = null } = data;
  await saveUniqueData(
    'health_history_data',
    userId,
    deviceName,
    ['past_conditions', 'surgeries', 'family_history', 'history'],
    [pastConditions, surgeries, familyHistory, JSON.stringify(history)]
  );
}

// ----------------- HEALTH ENDPOINTS -----------------
const endpoints = ['activity', 'heart', 'sleep', 'body', 'vitals', 'health', 'health_history'];

endpoints.forEach(ep => {
  app.post(`/${ep}`, async (req, res) => {
    try {
      const userId = req.body.userId?.toString() || null;
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
      console.error('Error in', ep, err);
      res.status(500).json({ success: false, error: err.message });
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
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', method: req.method, url: req.originalUrl });
});

// ----------------- START SERVER -----------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API running on port ${PORT}`);
});
