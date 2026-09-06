const bcrypt = require("bcrypt");
const pool = require("./config/db");

const users = [
    {
        full_name: "Arun Kumar",
        email: "arun@example.com",
        phone: "9000000001",
        password: "Password123"
    },
    {
        full_name: "Priya Sharma",
        email: "priya@example.com",
        phone: "9000000002",
        password: "Password123"
    },
    {
        full_name: "Karthik Raj",
        email: "karthik@example.com",
        phone: "9000000003",
        password: "Password123"
    },
    {
        full_name: "Meena Devi",
        email: "meena@example.com",
        phone: "9000000004",
        password: "Password123"
    },
    {
        full_name: "Test User",
        email: "test@example.com",
        phone: "9000000005",
        password: "Password123"
    }
];

async function seedUsers() {
    try {
        for (const user of users) {

            // Hash password before storing it
            const passwordHash = await bcrypt.hash(
                user.password,
                12
            );

            await pool.query(
                `
                INSERT INTO users (
                    full_name,
                    email,
                    phone,
                    password_hash
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (email)
                DO NOTHING
                `,
                [
                    user.full_name,
                    user.email,
                    user.phone,
                    passwordHash
                ]
            );

            console.log(`✅ Added/exists: ${user.email}`);
        }

        console.log("✅ User seeding completed.");

    } catch (error) {

        console.error("❌ Failed to seed users:", error);

    } finally {

        await pool.end();

    }
}

seedUsers();