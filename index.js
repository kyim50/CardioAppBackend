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
    const handle = `@${fullName}`;
    res.json({ success: true, message: "Registered successfully", userId, handle });
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
    const handle = `@${user.full_name}`;
    res.json({ success: true, message: "Login successful", userId, handle });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ----------------- SAVE FUNCTIONS -----------------
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
    const { currentHeartRate = 0, restingHeartRate = 0, hrv = 0 } = data;
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
    const { totalSleep = 0, deepSleep = 0, remSleep = 0, sleepHours = 0 } = data;
    await conn.execute(
      `INSERT INTO sleep_data (user_id, device_name, total_sleep, deep_sleep, rem_sleep, sleep_hours)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, deviceName, totalSleep, deepSleep, remSleep, sleepHours]
    );
  } finally {
    conn.release();
  }
}

async function saveActivityData(userId, deviceName, data) {
  const conn = await pool.getConnection();
  try {
    const { steps = 0, calories = 0, distance = 0, exerciseMinutes = 0 } = data;
    await conn.execute(
      `INSERT INTO activity_data (user_id, device_name, steps, calories, distance, exercise_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, deviceName, steps, calories, distance, exerciseMinutes]
    );
  } finally {
    conn.release();
  }
}

async function saveBodyData(userId, deviceName, data) {
  const conn = await pool.getConnection();
  try {
    const { weight = 0, bmi = 0, bodyFat = 0, leanMass = 0, vo2Max = 0 } = data;
    await conn.execute(
      `INSERT INTO body_data (user_id, device_name, weight, bmi, body_fat, lean_mass, vo2_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, deviceName, weight, bmi, bodyFat, leanMass, vo2Max]
    );
  } finally {
    conn.release();
  }
}

async function saveVitalsData(userId, deviceName, data) {
  const conn = await pool.getConnection();
  try {
    const { bloodPressureSystolic = 0, bloodPressureDiastolic = 0, spo2 = 0, temperature = 0 } = data;
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
      `INSERT INTO health_data (user_id, device_name, \`condition\`, allergies, medications)
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
    const { pastConditions = null, surgeries = null, familyHistory = null, history = null } = data;
    await conn.execute(
      `INSERT INTO health_history_data (user_id, device_name, past_conditions, surgeries, family_history, history)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, deviceName, pastConditions, surgeries, familyHistory, JSON.stringify(history)]
    );
  } finally {
    conn.release();
  }
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

// ----------------- ENHANCED INSIGHTS ENDPOINT -----------------
app.get('/insights/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // Get last 30 days of data for trend analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch comprehensive data with historical context
    const [activityData] = await pool.execute(
      `SELECT * FROM activity_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, thirtyDaysAgo]
    );
    
    const [heartData] = await pool.execute(
      `SELECT * FROM heart_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, thirtyDaysAgo]
    );
    
    const [sleepData] = await pool.execute(
      `SELECT * FROM sleep_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, thirtyDaysAgo]
    );

    const [bodyData] = await pool.execute(
      `SELECT * FROM body_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, thirtyDaysAgo]
    );

    const [vitalsData] = await pool.execute(
      `SELECT * FROM vitals_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, thirtyDaysAgo]
    );

    // Get last 7 days for weekly analysis
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [weeklyActivity] = await pool.execute(
      `SELECT * FROM activity_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, sevenDaysAgo]
    );

    const [weeklySleep] = await pool.execute(
      `SELECT * FROM sleep_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, sevenDaysAgo]
    );

    const [weeklyHeart] = await pool.execute(
      `SELECT * FROM heart_data WHERE user_id=? AND created_at >= ? ORDER BY created_at DESC`, 
      [userId, sevenDaysAgo]
    );

    // Calculate comprehensive insights
    const insights = calculateComprehensiveInsights({
      activity: activityData,
      heart: heartData,
      sleep: sleepData,
      body: bodyData,
      vitals: vitalsData,
      weeklyActivity,
      weeklySleep,
      weeklyHeart
    });

    res.json({ success: true, insights });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function for comprehensive analysis
function calculateComprehensiveInsights(data) {
  const insights = {
    currentMetrics: {},
    trends: {},
    healthScore: 0,
    recommendations: [],
    alerts: [],
    weeklyAverages: {},
    monthlyProgress: {}
  };

  // ========== ACTIVITY ANALYSIS ==========
  if (data.activity.length > 0) {
    const latestActivity = data.activity[0];
    const weeklySteps = data.weeklyActivity.map(d => d.steps || 0);
    const monthlySteps = data.activity.map(d => d.steps || 0);

    insights.currentMetrics.steps = latestActivity.steps || 0;
    insights.currentMetrics.calories = latestActivity.calories || 0;
    insights.currentMetrics.distance = latestActivity.distance || 0;
    insights.currentMetrics.exerciseMinutes = latestActivity.exercise_minutes || 0;

    // Weekly averages
    insights.weeklyAverages.steps = Math.round(weeklySteps.reduce((a, b) => a + b, 0) / weeklySteps.length);
    insights.weeklyAverages.calories = Math.round(data.weeklyActivity.reduce((sum, d) => sum + (d.calories || 0), 0) / data.weeklyActivity.length);

    // Trend analysis
    const recentSteps = weeklySteps.slice(0, 3);
    const olderSteps = weeklySteps.slice(3, 6);
    
    if (recentSteps.length > 0 && olderSteps.length > 0) {
      const recentAvg = recentSteps.reduce((a, b) => a + b, 0) / recentSteps.length;
      const olderAvg = olderSteps.reduce((a, b) => a + b, 0) / olderSteps.length;
      insights.trends.steps = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
    }

    // Activity recommendations
    if (insights.currentMetrics.steps < 5000) {
      insights.recommendations.push({
        category: "activity",
        priority: "high",
        title: "Increase Daily Movement",
        message: "Your step count is below recommended levels. Try taking short walks throughout the day."
      });
    } else if (insights.currentMetrics.steps >= 10000) {
      insights.recommendations.push({
        category: "activity",
        priority: "positive",
        title: "Excellent Activity Level",
        message: "You're consistently meeting your daily step goals. Keep up the great work!"
      });
    }
  }

  // ========== HEART RATE ANALYSIS ==========
  if (data.heart.length > 0) {
    const latestHeart = data.heart[0];
    const weeklyHR = data.weeklyHeart.map(d => d.resting_heart_rate || 0).filter(hr => hr > 0);
    
    insights.currentMetrics.currentHeartRate = latestHeart.current_heart_rate || 0;
    insights.currentMetrics.restingHeartRate = latestHeart.resting_heart_rate || 0;
    insights.currentMetrics.hrv = latestHeart.hrv || 0;

    if (weeklyHR.length > 0) {
      insights.weeklyAverages.restingHeartRate = Math.round(weeklyHR.reduce((a, b) => a + b, 0) / weeklyHR.length);

      // Heart rate trend
      const recentHR = weeklyHR.slice(0, 3);
      const olderHR = weeklyHR.slice(3, 6);
      
      if (recentHR.length > 0 && olderHR.length > 0) {
        const recentAvg = recentHR.reduce((a, b) => a + b, 0) / recentHR.length;
        const olderAvg = olderHR.reduce((a, b) => a + b, 0) / olderHR.length;
        insights.trends.heartRate = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
      }
    }

    // Heart rate analysis
    const rhr = insights.currentMetrics.restingHeartRate;
    if (rhr > 100) {
      insights.alerts.push({
        type: "warning",
        category: "heart",
        message: "Elevated resting heart rate detected. Consider stress management techniques."
      });
    } else if (rhr >= 50 && rhr <= 70) {
      insights.recommendations.push({
        category: "heart",
        priority: "positive",
        title: "Optimal Heart Health",
        message: "Your resting heart rate indicates excellent cardiovascular fitness."
      });
    }
  }

  // ========== SLEEP ANALYSIS ==========
  if (data.sleep.length > 0) {
    const latestSleep = data.sleep[0];
    const weeklySleepHours = data.weeklySleep.map(d => d.sleep_hours || 0).filter(h => h > 0);
    
    insights.currentMetrics.sleepHours = latestSleep.sleep_hours || 0;
    insights.currentMetrics.deepSleep = latestSleep.deep_sleep || 0;
    insights.currentMetrics.remSleep = latestSleep.rem_sleep || 0;

    if (weeklySleepHours.length > 0) {
      insights.weeklyAverages.sleepHours = (weeklySleepHours.reduce((a, b) => a + b, 0) / weeklySleepHours.length).toFixed(1);

      // Sleep trend
      const recentSleep = weeklySleepHours.slice(0, 3);
      const olderSleep = weeklySleepHours.slice(3, 6);
      
      if (recentSleep.length > 0 && olderSleep.length > 0) {
        const recentAvg = recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length;
        const olderAvg = olderSleep.reduce((a, b) => a + b, 0) / olderSleep.length;
        insights.trends.sleep = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
      }
    }

    // Sleep recommendations
    const sleepHours = insights.currentMetrics.sleepHours;
    if (sleepHours < 6) {
      insights.alerts.push({
        type: "warning",
        category: "sleep",
        message: "Insufficient sleep detected. Aim for 7-9 hours per night for optimal health."
      });
    } else if (sleepHours >= 7 && sleepHours <= 9) {
      insights.recommendations.push({
        category: "sleep",
        priority: "positive",
        title: "Optimal Sleep Duration",
        message: "Your sleep duration is in the ideal range for recovery and health."
      });
    }
  }

  // ========== BODY METRICS ANALYSIS ==========
  if (data.body.length > 0) {
    const latestBody = data.body[0];
    const monthlyWeight = data.body.map(d => d.weight || 0).filter(w => w > 0);
    
    insights.currentMetrics.weightKg = latestBody.weight || 0;
    insights.currentMetrics.bmi = latestBody.bmi || 0;
    insights.currentMetrics.bodyFat = latestBody.body_fat || 0;
    insights.currentMetrics.vo2Max = latestBody.vo2_max || 0;

    // Weight trend analysis
    if (monthlyWeight.length >= 2) {
      const recentWeight = monthlyWeight.slice(0, 5);
      const olderWeight = monthlyWeight.slice(5, 10);
      
      if (recentWeight.length > 0 && olderWeight.length > 0) {
        const recentAvg = recentWeight.reduce((a, b) => a + b, 0) / recentWeight.length;
        const olderAvg = olderWeight.reduce((a, b) => a + b, 0) / olderWeight.length;
        insights.trends.weight = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
      }
    }

    // BMI analysis
    const bmi = insights.currentMetrics.bmi;
    if (bmi > 0) {
      if (bmi >= 18.5 && bmi < 25) {
        insights.recommendations.push({
          category: "body",
          priority: "positive",
          title: "Healthy BMI Range",
          message: "Your BMI indicates a healthy weight range."
        });
      } else if (bmi >= 25) {
        insights.recommendations.push({
          category: "body",
          priority: "medium",
          title: "Weight Management",
          message: "Consider focusing on balanced nutrition and regular exercise."
        });
      }
    }
  }

  // ========== VITALS ANALYSIS ==========
  if (data.vitals.length > 0) {
    const latestVitals = data.vitals[0];
    
    insights.currentMetrics.oxygenSaturation = latestVitals.spo2 || 0;
    insights.currentMetrics.bloodPressureSystolic = latestVitals.bp_systolic || 0;
    insights.currentMetrics.bloodPressureDiastolic = latestVitals.bp_diastolic || 0;
    insights.currentMetrics.temperature = latestVitals.temperature || 0;

    // Oxygen saturation analysis
    const spo2 = insights.currentMetrics.oxygenSaturation;
    if (spo2 < 90 && spo2 > 0) {
      insights.alerts.push({
        type: "critical",
        category: "vitals",
        message: "Low blood oxygen detected. Consider consulting a healthcare provider."
      });
    } else if (spo2 >= 95) {
      insights.recommendations.push({
        category: "vitals",
        priority: "positive",
        title: "Excellent Oxygen Levels",
        message: "Your blood oxygen saturation is in the optimal range."
      });
    }

    // Blood pressure analysis
    const systolic = insights.currentMetrics.bloodPressureSystolic;
    const diastolic = insights.currentMetrics.bloodPressureDiastolic;
    
    if (systolic > 140 || diastolic > 90) {
      insights.alerts.push({
        type: "warning",
        category: "vitals",
        message: "Elevated blood pressure detected. Monitor regularly and consult healthcare provider."
      });
    }
  }

  // ========== CALCULATE OVERALL HEALTH SCORE ==========
  let totalScore = 0;
  let scoreComponents = 0;

  // Steps score (25%)
  if (insights.currentMetrics.steps > 0) {
    const stepsScore = Math.min(100, (insights.currentMetrics.steps / 10000) * 100);
    totalScore += stepsScore * 0.25;
    scoreComponents += 0.25;
  }

  // Heart rate score (25%)
  if (insights.currentMetrics.restingHeartRate > 0) {
    const rhr = insights.currentMetrics.restingHeartRate;
    let heartScore = 50;
    if (rhr >= 50 && rhr <= 70) heartScore = 100;
    else if (rhr > 70 && rhr <= 90) heartScore = 75;
    else if (rhr < 50 && rhr >= 40) heartScore = 85;
    
    totalScore += heartScore * 0.25;
    scoreComponents += 0.25;
  }

  // Sleep score (25%)
  if (insights.currentMetrics.sleepHours > 0) {
    const hours = insights.currentMetrics.sleepHours;
    let sleepScore = 50;
    if (hours >= 7 && hours <= 9) sleepScore = 100;
    else if (hours >= 6 && hours < 7) sleepScore = 80;
    else if (hours > 9 && hours <= 10) sleepScore = 85;
    
    totalScore += sleepScore * 0.25;
    scoreComponents += 0.25;
  }

  // Vitals score (25%)
  if (insights.currentMetrics.oxygenSaturation > 0) {
    const spo2 = insights.currentMetrics.oxygenSaturation;
    let vitalsScore = 50;
    if (spo2 >= 95) vitalsScore = 100;
    else if (spo2 >= 90) vitalsScore = 75;
    
    totalScore += vitalsScore * 0.25;
    scoreComponents += 0.25;
  }

  insights.healthScore = scoreComponents > 0 ? Math.round(totalScore / scoreComponents) : 0;

  // ========== GENERATE WEEKLY SUMMARY ==========
  insights.weeklySummary = {
    totalSteps: data.weeklyActivity.reduce((sum, d) => sum + (d.steps || 0), 0),
    avgSleepHours: insights.weeklyAverages.sleepHours || 0,
    workoutsCompleted: data.weeklyActivity.filter(d => (d.exercise_minutes || 0) > 30).length,
    healthScoreTrend: calculateHealthScoreTrend(data)
  };

  return insights;
}

// Helper function to calculate health score trend
function calculateHealthScoreTrend(data) {
  // Simple implementation - you can make this more sophisticated
  const hasPositiveTrends = [
    data.weeklyActivity.length > 3,
    data.weeklySleep.length > 3,
    data.weeklyHeart.length > 3
  ].filter(Boolean).length;

  if (hasPositiveTrends >= 2) return "improving";
  else if (hasPositiveTrends === 1) return "stable";
  else return "needs_attention";
}

// ----------------- GET RAW DATA -----------------
app.get('/raw/:endpoint/:deviceName', async (req, res) => {
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API running on port ${PORT}`);
});