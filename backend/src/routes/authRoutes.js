const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const pool = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// =====================================================
// 1. REGISTER
// =====================================================

router.post("/register", async (req, res) => {

    try {

        const {
            full_name,
            email,
            phone,
            password
        } = req.body;


        // -----------------------------
        // Validation
        // -----------------------------

        if (!full_name || !email || !password) {

            return res.status(400).json({
                error: "full_name, email and password are required"
            });

        }


        if (password.length < 6) {

            return res.status(400).json({
                error: "Password must contain at least 6 characters"
            });

        }


        const normalizedEmail =
            email.trim().toLowerCase();


        // -----------------------------
        // Check existing email
        // -----------------------------

        const existingUser = await pool.query(
            `
            SELECT id
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );


        if (existingUser.rows.length > 0) {

            return res.status(409).json({
                error: "Email already registered"
            });

        }


        // -----------------------------
        // Check phone if supplied
        // -----------------------------

        if (phone) {

            const existingPhone = await pool.query(
                `
                SELECT id
                FROM users
                WHERE phone = $1
                `,
                [phone.trim()]
            );


            if (existingPhone.rows.length > 0) {

                return res.status(409).json({
                    error: "Phone number already registered"
                });

            }

        }


        // -----------------------------
        // Hash password
        // -----------------------------

        const passwordHash =
            await bcrypt.hash(password, 12);


        // -----------------------------
        // Insert user
        // -----------------------------

        const result = await pool.query(
            `
            INSERT INTO users (
                full_name,
                email,
                phone,
                password_hash
            )
            VALUES ($1, $2, $3, $4)
            RETURNING
                id,
                full_name,
                email,
                phone,
                created_at
            `,
            [
                full_name.trim(),
                normalizedEmail,
                phone ? phone.trim() : null,
                passwordHash
            ]
        );


        const user = result.rows[0];


        return res.status(201).json({

            message: "User registered successfully",

            user

        });

    } catch (error) {

        console.error(
            "Registration error:",
            error
        );

        return res.status(500).json({
            error: "Failed to register user"
        });

    }

});


// =====================================================
// 2. LOGIN
// =====================================================

router.post("/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        if (!email || !password) {

            return res.status(400).json({
                error: "Email and password are required"
            });

        }


        const normalizedEmail =
            email.trim().toLowerCase();


        // -----------------------------
        // Find user
        // -----------------------------

        const result = await pool.query(
            `
            SELECT
                id,
                full_name,
                email,
                phone,
                password_hash
            FROM users
            WHERE email = $1
            `,
            [normalizedEmail]
        );


        if (result.rows.length === 0) {

            return res.status(401).json({
                error: "Invalid email or password"
            });

        }


        const user = result.rows[0];


        // -----------------------------
        // Compare password
        // -----------------------------

        const passwordMatch =
            await bcrypt.compare(
                password,
                user.password_hash
            );


        if (!passwordMatch) {

            return res.status(401).json({
                error: "Invalid email or password"
            });

        }


        // -----------------------------
        // Create JWT
        // -----------------------------

        const token = jwt.sign(

            {
                user_id: user.id,
                email: user.email
            },

            process.env.JWT_SECRET,

            {
                expiresIn:
                    process.env.JWT_EXPIRES_IN || "7d"
            }

        );


        // -----------------------------
        // Response
        // -----------------------------

        return res.json({

            message: "Login successful",

            token,

            user: {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                phone: user.phone
            }

        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        return res.status(500).json({
            error: "Failed to login"
        });

    }

});


// =====================================================
// 3. CURRENT USER
// =====================================================

router.get(
    "/me",
    authenticateToken,
    async (req, res) => {

        try {

            const result = await pool.query(
                `
                SELECT
                    id,
                    full_name,
                    email,
                    phone,
                    created_at,
                    updated_at
                FROM users
                WHERE id = $1
                `,
                [req.user.user_id]
            );


            if (result.rows.length === 0) {

                return res.status(404).json({
                    error: "User not found"
                });

            }


            return res.json({
                user: result.rows[0]
            });

        } catch (error) {

            console.error(
                "Get current user error:",
                error
            );

            return res.status(500).json({
                error: "Failed to fetch user"
            });

        }

    }
);


module.exports = router;