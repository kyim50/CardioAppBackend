const express = require('express');
const app = express();
app.use(express.json()); // parse JSON body

// In-memory storage (for testing)
let healthDataStore = {
    activity: {},
    heart: {},
    sleep: {},
    body: {},
    vitals: {},
    health: {},
    health_history: {}
};

// Helper function to store data safely
function storeData(endpoint, deviceName, data) {
    if (!healthDataStore[endpoint]) {
        healthDataStore[endpoint] = {};
    }
    if (!healthDataStore[endpoint][deviceName]) {
        healthDataStore[endpoint][deviceName] = [];
    }
    healthDataStore[endpoint][deviceName].push(data);
    console.log(`Data received for ${deviceName} on endpoint ${endpoint}`);
}

// POST endpoints
const endpoints = ['activity', 'heart', 'sleep', 'body', 'vitals', 'health', 'health_history'];
endpoints.forEach(ep => {
    app.post(`/${ep}`, (req, res) => {
        try {
            const deviceName = req.body.deviceName || "UnknownDevice";
            const data = req.body.data || req.body;
            storeData(ep, deviceName, data);
            res.json({ success: true, endpoint: ep });
        } catch (err) {
            console.error(`Error processing ${ep}:`, err);
            res.status(500).json({ success: false, error: err.message });
        }
    });
});

// GET endpoint to retrieve all data for a device
app.get('/:endpoint/:deviceName', (req, res) => {
    const { endpoint, deviceName } = req.params;
    if (!healthDataStore[endpoint]) {
        return res.status(404).json({ error: "Endpoint not found" });
    }
    const deviceData = healthDataStore[endpoint][deviceName];
    if (deviceData) {
        res.json(deviceData);
    } else {
        res.status(404).json({ error: `No data for device ${deviceName} on endpoint ${endpoint}` });
    }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => console.log(`API running on http://172.20.10.13:${PORT}`));
