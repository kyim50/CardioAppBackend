require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// ---------- REGISTER ----------
app.post('/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) return res.json({ success: false, message: 'Missing fields' });

        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.json({ success: false, message: 'Email already registered' });

        const hash = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
            [fullName, email, hash]
        );

        const userId = '@' + fullName.replace(/\s+/g, '');
        res.json({ success: true, userId });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Register failed' });
    }
});

// ---------- LOGIN ----------
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

// ---------- OTHER HEALTH ENDPOINTS ----------
// You can copy your existing /activity, /heart, /sleep, etc., endpoints here

app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
