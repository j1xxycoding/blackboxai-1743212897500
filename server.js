const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const path = require('path');
const mysql = require('mysql2/promise');
const app = express();
const port = 8000;

// MySQL Connection Pool
const pool = mysql.createPool({
    host: 'mysql-jaxxynt.alwaysdata.net',
    user: 'jaxxynt',
    password: 'nikmok13',
    database: 'jaxxynt_cloud',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Initialize database tables
async function initDatabase() {
    try {
        const connection = await pool.getConnection();
        
        // Drop existing tables to recreate with correct schema
        await connection.execute('DROP TABLE IF EXISTS transactions');
        await connection.execute('DROP TABLE IF EXISTS users');
        
        // Create users table with correct schema
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                telegram_id VARCHAR(255) PRIMARY KEY,
                username VARCHAR(255),
                photo_url TEXT,
                balance DECIMAL(10,2) DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Create transactions table
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id VARCHAR(255),
                receiver_id VARCHAR(255),
                amount DECIMAL(10,2),
                type ENUM('send', 'receive', 'purchase'),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(telegram_id),
                FOREIGN KEY (receiver_id) REFERENCES users(telegram_id)
            )
        `);

        connection.release();
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

initDatabase();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Debug logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Store OTPs in memory
const otpStore = new Map();

// Function to generate 6-digit OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000);
}

// Telegram Bot Token
const BOT_TOKEN = '7642959676:AAGT5DBFXsPDy7Ox9FPyGV0-VXfUQltUDz8';

// Function to generate a default profile picture URL with initials
function generateDefaultProfilePic(username) {
    // Use first letter of username, or 'A' if no username
    const initial = (username && username.charAt(0).toUpperCase()) || 'A';
    const colors = [
        '#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#34495e',
        '#16a085', '#27ae60', '#2980b9', '#8e44ad', '#2c3e50',
        '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#f39c12',
        '#d35400', '#c0392b', '#7f8c8d'
    ];
    
    // Use the initial's char code to consistently pick a color
    const colorIndex = initial.charCodeAt(0) % colors.length;
    const backgroundColor = encodeURIComponent(colors[colorIndex]);
    
    // Generate URL for a SVG with the initial and background color
    return `https://ui-avatars.com/api/?name=${initial}&background=${backgroundColor.substring(1)}&color=fff&size=256&bold=true&font-size=0.6`;
}

// Function to get user's profile photo URL
async function getUserProfilePhoto(userId, username) {
    try {
        // Get user profile photos
        const photosResponse = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/getUserProfilePhotos`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    limit: 1
                })
            }
        );

        const photosData = await photosResponse.json();
        console.log('Photos data:', photosData);
        
        if (photosData.ok && photosData.result.photos.length > 0) {
            // Get the file_id from the first photo (highest quality)
            const fileId = photosData.result.photos[0][0].file_id;
            
            // Get file path
            const fileResponse = await fetch(
                `https://api.telegram.org/bot${BOT_TOKEN}/getFile`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_id: fileId })
                }
            );

            const fileData = await fileResponse.json();
            console.log('File data:', fileData);
            
            if (fileData.ok && fileData.result.file_path) {
                const photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
                console.log('Generated photo URL:', photoUrl);
                return photoUrl;
            }
        }

        // If no Telegram photo is available, generate a default one
        return generateDefaultProfilePic(username);
    } catch (error) {
        console.error('Error fetching profile photo:', error);
        return generateDefaultProfilePic(username);
    }
}

app.post('/sendOTP', async (req, res) => {
    try {
        const { telegramId } = req.body;
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID is required' });
        }

        const otp = generateOTP();
        otpStore.set(telegramId, {
            otp: otp.toString(),
            expiry: Date.now() + 5 * 60 * 1000
        });

        const response = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegramId,
                    text: `Your OTP for login is: ${otp}. This OTP will expire in 5 minutes.`
                })
            }
        );

        const data = await response.json();
        if (!data.ok) {
            throw new Error(data.description || 'Failed to send OTP via Telegram');
        }

        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ 
            error: 'Failed to send OTP. Please make sure your Telegram ID is correct and you have started a chat with the bot.'
        });
    }
});

app.post('/verifyOTP', async (req, res) => {
    try {
        const { telegramId, otp } = req.body;

        if (!telegramId || !otp) {
            return res.status(400).json({ error: 'Telegram ID and OTP are required' });
        }

        const storedData = otpStore.get(telegramId);
        if (!storedData) {
            return res.status(400).json({ error: 'No OTP found. Please request a new OTP.' });
        }

        if (Date.now() > storedData.expiry) {
            otpStore.delete(telegramId);
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        if (storedData.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }

        otpStore.delete(telegramId);

        try {
            // Get user data from Telegram
            const userDataResponse = await fetch(
                `https://api.telegram.org/bot${BOT_TOKEN}/getChat`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: telegramId })
                }
            );

            const userData = await userDataResponse.json();
            
            if (userData.ok) {
                const username = userData.result.username || 'Anonymous';
                // Get profile photo URL, passing username for default pic generation
                const photoUrl = await getUserProfilePhoto(telegramId, username);
                console.log('Photo URL for new user:', photoUrl);

                const connection = await pool.getConnection();
                
                // First check if user exists
                const [existingUser] = await connection.execute(
                    'SELECT telegram_id FROM users WHERE telegram_id = ?',
                    [telegramId]
                );

                if (existingUser.length === 0) {
                    // Insert new user
                    await connection.execute(
                        'INSERT INTO users (telegram_id, username, photo_url) VALUES (?, ?, ?)',
                        [telegramId, username, photoUrl]
                    );
                } else {
                    // Update existing user
                    await connection.execute(
                        'UPDATE users SET username = ?, photo_url = ? WHERE telegram_id = ?',
                        [username, photoUrl, telegramId]
                    );
                }

                connection.release();
            }

            res.json({ 
                success: true, 
                message: 'Login successful!',
                redirect: '/dashboard.html'
            });
        } catch (error) {
            console.error('Database error:', error);
            throw error;
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/getUserData', async (req, res) => {
    try {
        const { telegramId } = req.body;
        
        if (!telegramId) {
            return res.status(400).json({ error: 'Telegram ID is required' });
        }

        const connection = await pool.getConnection();
        
        // Get user data
        const [users] = await connection.execute(
            'SELECT * FROM users WHERE telegram_id = ?',
            [telegramId]
        );

        if (users.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'User not found' });
        }

        // Update profile photo if needed
        const photoUrl = await getUserProfilePhoto(telegramId, users[0].username);
        console.log('Current photo URL:', users[0].photo_url);
        console.log('New photo URL:', photoUrl);

        if (photoUrl !== users[0].photo_url) {
            await connection.execute(
                'UPDATE users SET photo_url = ? WHERE telegram_id = ?',
                [photoUrl, telegramId]
            );
            users[0].photo_url = photoUrl;
        }

        // Get recent transactions
        const [transactions] = await connection.execute(
            `SELECT t.*, 
                    s.username as sender_username,
                    r.username as receiver_username
             FROM transactions t
             LEFT JOIN users s ON t.sender_id = s.telegram_id
             LEFT JOIN users r ON t.receiver_id = r.telegram_id
             WHERE t.sender_id = ? OR t.receiver_id = ?
             ORDER BY t.created_at DESC
             LIMIT 10`,
            [telegramId, telegramId]
        );

        connection.release();

        res.json({ 
            success: true, 
            userData: {
                ...users[0],
                transactions: transactions.map(t => ({
                    ...t,
                    isOutgoing: t.sender_id === telegramId
                }))
            }
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/sendMoney', async (req, res) => {
    try {
        const { senderId, receiverId, amount } = req.body;
        
        if (!senderId || !receiverId || !amount) {
            return res.status(400).json({ error: 'Sender ID, receiver ID, and amount are required' });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check sender's balance
            const [sender] = await connection.execute(
                'SELECT balance FROM users WHERE telegram_id = ? FOR UPDATE',
                [senderId]
            );

            if (sender.length === 0) {
                throw new Error('Sender not found');
            }

            if (sender[0].balance < amount) {
                throw new Error('Insufficient funds');
            }

            // Check if receiver exists
            const [receiver] = await connection.execute(
                'SELECT telegram_id FROM users WHERE telegram_id = ?',
                [receiverId]
            );

            if (receiver.length === 0) {
                throw new Error('Receiver not found');
            }

            // Update balances
            await connection.execute(
                'UPDATE users SET balance = balance - ? WHERE telegram_id = ?',
                [amount, senderId]
            );

            await connection.execute(
                'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
                [amount, receiverId]
            );

            // Record transaction
            await connection.execute(
                'INSERT INTO transactions (sender_id, receiver_id, amount, type) VALUES (?, ?, ?, "send")',
                [senderId, receiverId, amount]
            );

            await connection.commit();
            res.json({ success: true, message: 'Transfer successful' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error sending money:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

app.post('/recordPurchase', async (req, res) => {
    try {
        const { userId, amount, description } = req.body;
        
        if (!userId || !amount || !description) {
            return res.status(400).json({ error: 'User ID, amount, and description are required' });
        }

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Check user's balance
            const [user] = await connection.execute(
                'SELECT balance FROM users WHERE telegram_id = ? FOR UPDATE',
                [userId]
            );

            if (user.length === 0) {
                throw new Error('User not found');
            }

            if (user[0].balance < amount) {
                throw new Error('Insufficient funds');
            }

            // Update balance
            await connection.execute(
                'UPDATE users SET balance = balance - ? WHERE telegram_id = ?',
                [amount, userId]
            );

            // Record transaction
            await connection.execute(
                'INSERT INTO transactions (sender_id, amount, type, description) VALUES (?, ?, "purchase", ?)',
                [userId, amount, description]
            );

            await connection.commit();
            res.json({ success: true, message: 'Purchase recorded successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error recording purchase:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});