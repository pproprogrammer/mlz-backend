require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(express.json()); // <--- CRITICAL: Enables express to parse JSON payloads
app.use(bodyParser.json());

// Establish connection credentials pool using environment variables
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'mysql.railway.internal',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'nFGeecYKbSaHozMWTnIMDVfJsQuFOGfG',
    database: process.env.DB_DATABASE || 'railway',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// const pool = mysql.createPool({
//     host: process.env.DB_HOST || 'localhost',
//     user: process.env.DB_USER || 'mlzerpsystem_percentill',
//     password: process.env.DB_PASSWORD || 'eba8c8a56ba7248c45d8c37e8422a8a73b4523d2',
//     database: process.env.DB_DATABASE || 'mlzerpsystem_percentill',
//     waitForConnections: true,
//     connectionLimit: 10
// });

app.post('/api', async (req, res) => {
    console.log("Incoming Request Body:", req.body); // <-- Add this temporary line
    const { action, payload } = req.body;
    try {
        switch (action) {
            case 'login': {
                const [users] = await pool.execute(
                    'SELECT * FROM Users WHERE Username = ? AND Password = ? AND is_Deleted = 0',
                    [payload.username, payload.password]
                );
                if (users.length > 0) {
                    const userObj = users[0];
                    const [menu] = await pool.execute('SELECT * FROM Menu WHERE Role = ?', [userObj.Role]);
                    return res.json({ success: true, user: userObj, menu: menu });
                }
                return res.json({ success: false, message: 'Authentication rejected.' });
            }

            case 'getPageData': {
                const [schema] = await pool.execute(
                    'SELECT * FROM Schema_Registry WHERE Sheet = ? AND Role = ?',
                    [payload.pageName, payload.role]
                );
                let query = `SELECT * FROM ?? WHERE is_Deleted = 0`;
                let queryParams = [payload.pageName];

                if (payload.uiFilters) {
                    Object.keys(payload.uiFilters).forEach(key => {
                        if (payload.uiFilters[key]) {
                            query += ` AND ?? LIKE ?`;
                            queryParams.push(key, `%${payload.uiFilters[key]}%`);
                        }
                    });
                }
                const offset = (payload.pageNumber - 1) * payload.pageSize;
                query += ` LIMIT ? OFFSET ?`;
                queryParams.push(payload.pageSize, offset);

                const [data] = await pool.execute(query, queryParams);
                const [[{total}]] = await pool.execute(`SELECT COUNT(*) as total FROM ?? WHERE is_Deleted = 0`, [payload.pageName]);
                const totalPages = Math.ceil(total / payload.pageSize) || 1;

                return res.json({ schema: schema, data: data, totalPages: totalPages, currentPage: payload.pageNumber });
            }

            case 'saveData': {
                const { sheetName, formData, id } = payload;
                if (id) {
                    const fields = Object.keys(formData).map(key => `?? = ?`).join(', ');
                    const query = `UPDATE ?? SET ${fields} WHERE ID = ?`;
                    await pool.execute(query, [sheetName, ...Object.entries(formData).flat(), id]);
                } else {
                    const recordId = 'ID-' + Math.floor(Math.random() * 100000);
                    formData.ID = recordId;
                    const fields = Object.keys(formData).join(', ');
                    const placeholders = Object.keys(formData).map(() => '?').join(', ');
                    const query = `INSERT INTO ?? (${fields}) VALUES (${placeholders})`;
                    await pool.execute(query, [sheetName, ...Object.values(formData)]);
                }
                return res.json({ success: true });
            }

            case 'deleteRow': {
                await pool.execute('UPDATE ?? SET is_Deleted = 1 WHERE ID = ?', [payload.sheetName, payload.id]);
                return res.json({ success: true });
            }

            case 'updateSingleField': {
                await pool.execute('UPDATE ?? SET ?? = ? WHERE ID = ?', [payload.sheetName, payload.fieldName, payload.value, payload.id]);
                return res.json({ success: true });
            }

            default:
                return res.status(400).json({ success: false, message: 'Action route undefined.' });
        }
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server online`));
