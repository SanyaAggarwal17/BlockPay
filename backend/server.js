const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// -----------------------------------------
// 1. THE DATABASE SCHEMAS
// -----------------------------------------
const vaultSchema = new mongoose.Schema({
    userWallet: { type: String, required: true, lowercase: true },
    planId: { type: Number, required: true },
    vaultName: { type: String, required: true },
    depositAmount: { type: String, required: true }
}, { timestamps: true });

const Vault = mongoose.model('Vault', vaultSchema);

// 🚀 NEW: The Ledger Schema
const transactionSchema = new mongoose.Schema({
    userWallet: { type: String, required: true, lowercase: true },
    vaultName: { type: String, required: true },
    txType: { type: String, required: true }, // 'DEPOSIT', 'WITHDRAW', 'EMERGENCY'
    amount: { type: String, required: true },
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', transactionSchema);

// -----------------------------------------
// 2. THE API ROUTES
// -----------------------------------------

// Route: Save new vault & Log the Deposit Transaction
app.post('/api/vaults', async (req, res) => {
    try {
        const { userWallet, planId, vaultName, depositAmount } = req.body;
        
        // 1. Save the Vault
        const newVault = new Vault({ userWallet, planId, vaultName, depositAmount });
        await newVault.save();

        // 2. 🚀 NEW: Log it in the Ledger!
        const newTx = new Transaction({ 
            userWallet, 
            vaultName, 
            txType: 'DEPOSIT', 
            amount: depositAmount 
        });
        await newTx.save();

        res.status(201).json({ message: "Vault & Transaction saved!", vault: newVault });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to save vault" });
    }
});

app.get('/api/vaults/:walletAddress', async (req, res) => {
    try {
        const vaults = await Vault.find({ userWallet: req.params.walletAddress.toLowerCase() });
        res.status(200).json(vaults);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch vaults" });
    }
});

// 🚀 NEW Route: Fetch Ledger History (Most recent 10)
app.get('/api/transactions/:walletAddress', async (req, res) => {
    try {
        const history = await Transaction.find({ userWallet: req.params.walletAddress.toLowerCase() })
            .sort({ createdAt: -1 }) // Sort by newest first
            .limit(10);              // Only grab the last 10
        res.status(200).json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// 🚀 NEW Route: Log a Withdrawal or Emergency Break
app.post('/api/transactions', async (req, res) => {
    try {
        const { userWallet, vaultName, txType, amount } = req.body;
        const newTx = new Transaction({ userWallet, vaultName, txType, amount });
        await newTx.save();
        res.status(201).json({ message: "Transaction logged!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to log transaction" });
    }
});

// 🚀 NEW: Global Ticker Route (Get latest 20 actions from ANYONE)
app.get('/api/transactions/all', async (req, res) => {
    try {
        const history = await Transaction.find()
            .sort({ createdAt: -1 }) // Get newest first
            .limit(20);              // Limit to 20 for the scrolling ticker
        res.status(200).json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch global history" });
    }
});

// 🚀 NEW: Global Statistics Route (Real-time Burn Tracker)
app.get('/api/stats/global', async (req, res) => {
    try {
        // 1. Calculate Total ETH "Burned" (Sum of all EMERGENCY transactions)
        const burnStats = await Transaction.aggregate([
            { $match: { txType: 'EMERGENCY' } },
            { $group: { _id: null, totalBurned: { $sum: { $toDouble: "$amount" } } } }
        ]);

        // 2. Count total active users
        const totalUsers = await Vault.distinct('userWallet');

        // 3. Count total successful withdrawals (The "Discipline" metric)
        const successCount = await Transaction.countDocuments({ txType: 'WITHDRAW' });

        res.status(200).json({
            burnedEth: burnStats.length > 0 ? burnStats[0].totalBurned.toFixed(3) : "0.000",
            userCount: totalUsers.length,
            disciplineRate: successCount > 0 ? successCount : 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch global stats" });
    }
});

// -----------------------------------------
// 3. START THE ENGINE
// -----------------------------------------
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB!");
        app.listen(process.env.PORT || 5000, () => {
            console.log(`🚀 API running on http://localhost:${process.env.PORT || 5000}`);
        });
    })
    .catch((error) => console.error("❌ MongoDB connection error:", error));