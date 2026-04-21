const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Inisialisasi Upstash Redis (Vercel KV)
let redis = null;
try {
    const { Redis } = require('@upstash/redis');
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = Redis.fromEnv();
        console.log('Upstash Redis initialized via ENV.');
    } else {
        console.warn('⚠️ UPSTASH_REDIS_REST_URL or TOKEN is missing. Database will not work until set.');
    }
} catch (e) {
    console.error('⚠️ @upstash/redis package is missing or failed to load.', e);
}

const app = express();

// Middleware keamanan dan logging
app.use(helmet()); 
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rute Default / Home
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Napoleon Server is Running on Vercel!',
        timestamp: new Date().toISOString()
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Server health is nominal',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ==========================================
// ENDPOINT ROBLOX: GET SCRIPT
// ==========================================
app.get('/api/script', async (req, res) => {
    if (!redis) return res.status(500).json({ status: 'error', message: 'Database is not configured' });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ status: 'error', message: 'Penyusup Dilarang! (Dibutuhkan format: Bearer <KEY>)' });
        }
        
        const key = authHeader.split(' ')[1];
        
        // Verifikasi ke database
        const isValid = await redis.get(`roblox_key:${key}`);
        if (!isValid) {
            return res.status(403).json({ status: 'error', message: 'Invalid or expired key!' });
        }

        // Ambil isi script
        const scriptContent = await redis.get('napoleon_script');
        if (!scriptContent) {
            return res.status(404).json({ status: 'error', message: 'Wait for admin to upload the script.' });
        }

        // MENGIRIM TIPE TEXT BIASA AGAR BISA DILOAD OLEH LUA
        res.setHeader('Content-Type', 'text/plain');
        res.send(String(scriptContent));
    } catch (error) {
        console.error('KV Error:', error);
        res.status(500).json({ status: 'error', message: 'Kesalahan Internal Server' });
    }
});

// ==========================================
// ENDPOINT ADMIN: MANAGEMEN DATABASE
// ==========================================
app.post('/api/admin/set-data', async (req, res) => {
    if (!redis) return res.status(500).json({ status: 'error', message: 'Database is not configured' });

    try {
        const adminSecret = req.headers['x-admin-secret'];
        // ANDA HARUS SET 'ADMIN_SECRET' di Vercel Environment Variables
        if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
            return res.status(403).json({ status: 'error', message: 'Unauthorized (Salah Secret Admin)' });
        }

        const { action, key, script } = req.body;

        if (action === 'add_key') {
            await redis.set(`roblox_key:${key}`, 'valid');
            return res.json({ status: 'success', message: `Berhasil menambahkan key: ${key}` });
        } else if (action === 'remove_key') {
            await redis.del(`roblox_key:${key}`);
            return res.json({ status: 'success', message: `Berhasil menghapus key: ${key}` });
        } else if (action === 'update_script') {
            await redis.set('napoleon_script', script);
            return res.json({ status: 'success', message: 'Script inti berhasil diupdate!' });
        }

        return res.status(400).json({ status: 'error', message: 'Aksi (action) tidak valid' });
    } catch (error) {
        console.error('KV Error:', error);
        res.status(500).json({ status: 'error', message: 'Kesalahan Internal Server' });
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal server error'
    });
});

// HARUS di-export modul express-nya agar Vercel bisa membacanya 
module.exports = app;
