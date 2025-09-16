// Enhanced index.js - More comprehensive health insights
require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const app = express();
// --- SETUP MIDDLEWARE ---
app.use(cors()); // <-- 2. USE THE CORS MIDDLEWARE HERE
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
    res.json({ success: true, message: "Login successful", userId, handle, fullName: user.full_name });
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
    const insights = calculateEnhancedInsights({
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

// Enhanced insights calculation with more comprehensive analysis
function calculateEnhancedInsights(data) {
  const insights = {
    currentMetrics: {},
    trends: {},
    healthScore: 0,
    recommendations: [],
    alerts: [],
    weeklyAverages: {},
    monthlyProgress: {},
    detailedAnalysis: {
      steps: {},
      sleep: {},
      heart: {},
      body: {},
      vitals: {}
    },
    timeOfDay: getTimeBasedGreeting(),
    streaks: calculateStreaks(data),
    personalBests: calculatePersonalBests(data)
  };

  // ========== ENHANCED ACTIVITY ANALYSIS ==========
  if (data.activity.length > 0) {
    const latestActivity = data.activity[0];
    const weeklySteps = data.weeklyActivity.map(d => d.steps || 0);
    const monthlySteps = data.activity.map(d => d.steps || 0);

    insights.currentMetrics.steps = latestActivity.steps || 0;
    insights.currentMetrics.calories = latestActivity.calories || 0;
    insights.currentMetrics.distance = latestActivity.distance || 0;
    insights.currentMetrics.exerciseMinutes = latestActivity.exercise_minutes || 0;

    // Enhanced weekly analysis
    insights.weeklyAverages.steps = Math.round(weeklySteps.reduce((a, b) => a + b, 0) / weeklySteps.length);
    insights.weeklyAverages.calories = Math.round(data.weeklyActivity.reduce((sum, d) => sum + (d.calories || 0), 0) / data.weeklyActivity.length);
    insights.weeklyAverages.distance = (data.weeklyActivity.reduce((sum, d) => sum + (d.distance || 0), 0) / data.weeklyActivity.length).toFixed(1);

    // Detailed activity analysis
    insights.detailedAnalysis.steps = {
      todayVsAverage: ((latestActivity.steps || 0) / insights.weeklyAverages.steps * 100).toFixed(1),
      weeklyTotal: weeklySteps.reduce((a, b) => a + b, 0),
      bestDay: Math.max(...weeklySteps),
      consistency: calculateConsistency(weeklySteps),
      projectedWeekly: (latestActivity.steps || 0) * 7,
      goalProgress: ((latestActivity.steps || 0) / 10000 * 100).toFixed(1)
    };

    // Enhanced recommendations
    if (insights.currentMetrics.steps < 5000) {
      insights.recommendations.push({
        category: "activity",
        priority: "high",
        title: "Boost Your Daily Movement",
        message: `You're at ${insights.currentMetrics.steps} steps today. Try taking a 10-minute walk to add ~1,000 steps.`,
        actionable: true,
        suggestion: "Take stairs instead of elevators, park further away, or walk during phone calls."
      });
    } else if (insights.currentMetrics.steps >= 8000) {
      insights.recommendations.push({
        category: "activity",
        priority: "positive",
        title: "Outstanding Activity Level",
        message: `${insights.currentMetrics.steps} steps puts you in the top 20% of active individuals.`,
        streak: insights.streaks.steps || 0
      });
    }

    // Trend analysis with detailed insights
    const recentSteps = weeklySteps.slice(0, 3);
    const olderSteps = weeklySteps.slice(3, 6);
    
    if (recentSteps.length > 0 && olderSteps.length > 0) {
      const recentAvg = recentSteps.reduce((a, b) => a + b, 0) / recentSteps.length;
      const olderAvg = olderSteps.reduce((a, b) => a + b, 0) / olderSteps.length;
      insights.trends.steps = ((recentAvg - olderAvg) / olderAvg * 100).toFixed(1);
      
      if (Math.abs(insights.trends.steps) > 10) {
        insights.recommendations.push({
          category: "activity",
          priority: insights.trends.steps > 0 ? "positive" : "medium",
          title: insights.trends.steps > 0 ? "Positive Activity Trend" : "Activity Declining",
          message: `Your daily steps have ${insights.trends.steps > 0 ? 'increased' : 'decreased'} by ${Math.abs(insights.trends.steps)}% this week.`
        });
      }
    }
  }

  // ========== ENHANCED SLEEP ANALYSIS ==========
  if (data.sleep.length > 0) {
    const latestSleep = data.sleep[0];
    const weeklySleepHours = data.weeklySleep.map(d => d.sleep_hours || 0).filter(h => h > 0);
    
    insights.currentMetrics.sleepHours = latestSleep.sleep_hours || 0;
    insights.currentMetrics.deepSleep = latestSleep.deep_sleep || 0;
    insights.currentMetrics.remSleep = latestSleep.rem_sleep || 0;

    if (weeklySleepHours.length > 0) {
      insights.weeklyAverages.sleepHours = (weeklySleepHours.reduce((a, b) => a + b, 0) / weeklySleepHours.length).toFixed(1);
      insights.weeklyAverages.deepSleep = (data.weeklySleep.reduce((sum, d) => sum + (d.deep_sleep || 0), 0) / data.weeklySleep.length).toFixed(1);

      // Detailed sleep analysis
      insights.detailedAnalysis.sleep = {
        sleepEfficiency: calculateSleepEfficiency(latestSleep),
        weeklyTotal: weeklySleepHours.reduce((a, b) => a + b, 0).toFixed(1),
        averageBedtime: estimateAverageBedtime(data.weeklySleep),
        sleepDebt: calculateSleepDebt(weeklySleepHours),
        consistency: calculateSleepConsistency(weeklySleepHours),
        recommendation: getSleepRecommendation(latestSleep.sleep_hours || 0)
      };

      // Enhanced sleep recommendations
      const sleepHours = insights.currentMetrics.sleepHours;
      if (sleepHours < 6) {
        insights.alerts.push({
          type: "warning",
          category: "sleep",
          message: `${sleepHours} hours is below optimal range. Sleep debt may affect cognitive performance.`,
          impact: "high"
        });
        insights.recommendations.push({
          category: "sleep",
          priority: "high",
          title: "Prioritize Sleep Recovery",
          message: "Consider going to bed 30-60 minutes earlier tonight.",
          actionable: true,
          suggestion: "Set a bedtime reminder and avoid screens 1 hour before sleep."
        });
      } else if (sleepHours >= 7 && sleepHours <= 9) {
        insights.recommendations.push({
          category: "sleep",
          priority: "positive",
          title: "Excellent Sleep Duration",
          message: `${sleepHours} hours is optimal for recovery and cognitive function.`
        });
      }
    }
  }

  // ========== ENHANCED HEART RATE ANALYSIS ==========
  if (data.heart.length > 0) {
    const latestHeart = data.heart[0];
    const weeklyHR = data.weeklyHeart.map(d => d.resting_heart_rate || 0).filter(hr => hr > 0);
    
    insights.currentMetrics.currentHeartRate = latestHeart.current_heart_rate || 0;
    insights.currentMetrics.restingHeartRate = latestHeart.resting_heart_rate || 0;
    insights.currentMetrics.hrv = latestHeart.hrv || 0;

    if (weeklyHR.length > 0) {
      insights.weeklyAverages.restingHeartRate = Math.round(weeklyHR.reduce((a, b) => a + b, 0) / weeklyHR.length);

      // Detailed heart analysis
      insights.detailedAnalysis.heart = {
        cardiovascularFitness: assessCardiovascularFitness(insights.currentMetrics.restingHeartRate),
        heartRateVariability: insights.currentMetrics.hrv,
        weeklyTrend: calculateHeartRateTrend(weeklyHR),
        recoveryIndicator: assessRecoveryStatus(latestHeart),
        targetZones: calculateHeartRateZones(insights.currentMetrics.restingHeartRate)
      };

      // Enhanced heart rate recommendations
      const rhr = insights.currentMetrics.restingHeartRate;
      if (rhr > 100) {
        insights.alerts.push({
          type: "warning",
          category: "heart",
          message: "Elevated resting heart rate may indicate stress or overtraining.",
          impact: "medium"
        });
        insights.recommendations.push({
          category: "heart",
          priority: "high",
          title: "Focus on Recovery",
          message: "Consider stress management, hydration, and adequate rest.",
          actionable: true
        });
      } else if (rhr >= 50 && rhr <= 70) {
        insights.recommendations.push({
          category: "heart",
          priority: "positive",
          title: "Optimal Cardiovascular Health",
          message: `RHR of ${rhr} bpm indicates excellent fitness level.`
        });
      }
    }
  }

  // ========== ENHANCED HEALTH SCORE CALCULATION ==========
  insights.healthScore = calculateEnhancedHealthScore(insights);

  // ========== PERSONALIZED INSIGHTS ==========
  insights.personalizedInsights = generatePersonalizedInsights(insights, data);

  return insights;
}

// Helper functions for enhanced analysis
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function calculateStreaks(data) {
  const streaks = {};
  
  // Calculate step streaks (days with >8000 steps)
  if (data.activity.length > 0) {
    let stepStreak = 0;
    for (const day of data.activity.reverse()) {
      if ((day.steps || 0) >= 8000) {
        stepStreak++;
      } else {
        break;
      }
    }
    streaks.steps = stepStreak;
  }

  return streaks;
}

function calculatePersonalBests(data) {
  const bests = {};
  
  if (data.activity.length > 0) {
    bests.maxSteps = Math.max(...data.activity.map(d => d.steps || 0));
    bests.maxCalories = Math.max(...data.activity.map(d => d.calories || 0));
    bests.maxDistance = Math.max(...data.activity.map(d => d.distance || 0));
  }

  if (data.sleep.length > 0) {
    bests.maxSleep = Math.max(...data.sleep.map(d => d.sleep_hours || 0));
  }

  return bests;
}

function calculateConsistency(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, (1 - (stdDev / mean)) * 100).toFixed(1);
}

function calculateSleepEfficiency(sleepData) {
  if (!sleepData.sleep_hours || !sleepData.total_sleep) return 0;
  return ((sleepData.sleep_hours / sleepData.total_sleep) * 100).toFixed(1);
}

function estimateAverageBedtime(weeklyData) {
  // Simplified estimation - would need actual bedtime data
  return "10:30 PM";
}

function calculateSleepDebt(sleepHours) {
  const optimalSleep = 8;
  const totalDebt = sleepHours.reduce((debt, hours) => {
    return debt + Math.max(0, optimalSleep - hours);
  }, 0);
  return totalDebt.toFixed(1);
}

function calculateSleepConsistency(sleepHours) {
  return calculateConsistency(sleepHours);
}

function getSleepRecommendation(hours) {
  if (hours < 6) return "Prioritize getting 7-9 hours tonight";
  if (hours > 9) return "Consider consistent sleep schedule";
  return "Maintain current sleep patterns";
}

function assessCardiovascularFitness(rhr) {
  if (rhr < 60) return "Excellent";
  if (rhr < 70) return "Good";
  if (rhr < 80) return "Average";
  return "Needs Improvement";
}

function calculateHeartRateTrend(weeklyHR) {
  if (weeklyHR.length < 2) return "Insufficient data";
  const recent = weeklyHR.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const older = weeklyHR.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const change = ((recent - older) / older * 100).toFixed(1);
  return change > 0 ? `+${change}%` : `${change}%`;
}

function assessRecoveryStatus(heartData) {
  const rhr = heartData.resting_heart_rate || 0;
  const hrv = heartData.hrv || 0;
  
  if (rhr < 60 && hrv > 30) return "Excellent recovery";
  if (rhr < 70 && hrv > 20) return "Good recovery";
  return "Consider more rest";
}

function calculateHeartRateZones(rhr) {
  const maxHR = 220 - 30; // Assuming average age
  return {
    fat_burn: `${Math.round(maxHR * 0.6)}-${Math.round(maxHR * 0.7)}`,
    cardio: `${Math.round(maxHR * 0.7)}-${Math.round(maxHR * 0.85)}`,
    peak: `${Math.round(maxHR * 0.85)}-${maxHR}`
  };
}

function calculateEnhancedHealthScore(insights) {
  let totalScore = 0;
  let components = 0;

  // Activity score (30%)
  if (insights.currentMetrics.steps > 0) {
    const stepsScore = Math.min(100, (insights.currentMetrics.steps / 10000) * 100);
    totalScore += stepsScore * 0.3;
    components += 0.3;
  }

  // Sleep score (30%)
  if (insights.currentMetrics.sleepHours > 0) {
    const hours = insights.currentMetrics.sleepHours;
    let sleepScore = 50;
    if (hours >= 7 && hours <= 9) sleepScore = 100;
    else if (hours >= 6 && hours < 7) sleepScore = 80;
    else if (hours > 9 && hours <= 10) sleepScore = 85;
    
    totalScore += sleepScore * 0.3;
    components += 0.3;
  }

  // Heart health score (25%)
  if (insights.currentMetrics.restingHeartRate > 0) {
    const rhr = insights.currentMetrics.restingHeartRate;
    let heartScore = 50;
    if (rhr >= 50 && rhr <= 70) heartScore = 100;
    else if (rhr > 70 && rhr <= 90) heartScore = 75;
    else if (rhr < 50 && rhr >= 40) heartScore = 85;
    
    totalScore += heartScore * 0.25;
    components += 0.25;
  }

  // Consistency bonus (15%)
  const consistency = parseFloat(insights.detailedAnalysis.steps?.consistency || 0);
  totalScore += (consistency / 100) * 15;
  components += 0.15;

  return components > 0 ? Math.round(totalScore / components) : 0;
}

function generatePersonalizedInsights(insights, data) {
  const personalized = [];

  // Time-based insights
  const hour = new Date().getHours();
  if (hour < 10 && insights.currentMetrics.steps < 1000) {
    personalized.push({
      type: "morning_motivation",
      message: "Start your day strong! A morning walk can boost energy and mood.",
      actionable: true
    });
  }

  // Trend-based insights
  if (insights.trends.steps && parseFloat(insights.trends.steps) > 15) {
    personalized.push({
      type: "positive_trend",
      message: `Your activity is trending upward by ${insights.trends.steps}% - keep up the momentum!`,
      celebration: true
    });
  }

  return personalized;
}

// ----------------- ALL HEALTH DATA ENDPOINT -----------------
app.get('/all-health-data/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const [activityData] = await pool.execute(
      `SELECT * FROM activity_data WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, 
      [userId]
    );
    
    const [heartData] = await pool.execute(
      `SELECT * FROM heart_data WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, 
      [userId]
    );
    
    const [sleepData] = await pool.execute(
      `SELECT * FROM sleep_data WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, 
      [userId]
    );

    const [bodyData] = await pool.execute(
      `SELECT * FROM body_data WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, 
      [userId]
    );

    const [vitalsData] = await pool.execute(
      `SELECT * FROM vitals_data WHERE user_id=? ORDER BY created_at DESC LIMIT 30`, 
      [userId]
    );

    const [healthData] = await pool.execute(
      `SELECT * FROM health_data WHERE user_id=? ORDER BY created_at DESC LIMIT 10`, 
      [userId]
    );

    res.json({
      success: true,
      data: {
        activity: activityData,
        heart: heartData,
        sleep: sleepData,
        body: bodyData,
        vitals: vitalsData,
        health: healthData,
        summary: {
          totalRecords: activityData.length + heartData.length + sleepData.length + bodyData.length + vitalsData.length + healthData.length,
          lastUpdated: new Date().toISOString(),
          categories: ['Activity', 'Heart Rate', 'Sleep', 'Body Measurements', 'Vitals', 'Health Records']
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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