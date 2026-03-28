import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';

export default function VaultCard({ vault, contract, onRefresh, currency, ethPrice, index }) {
  const [available, setAvailable] = useState("0.0");
  const [locked, setLocked] = useState("0.0");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 🚀 NEW: We now store the raw timestamp to calculate the live countdown
  const [unlockTimestamp, setUnlockTimestamp] = useState(null);
  const [countdownText, setCountdownText] = useState("Calculating...");

  const fetchLiveBalances = async () => {
    if (!contract || !vault.planId) return;
    try {
      const availWei = await contract.getAvailableAmount(vault.planId);
      const lockWei = await contract.getLockedAmount(vault.planId);
      
      const availEth = ethers.formatEther(availWei);
      const lockEth = ethers.formatEther(lockWei);
      
      setAvailable(availEth);
      setLocked(lockEth);

      const totalOriginal = parseFloat(vault.depositAmount);
      const currentlyLocked = parseFloat(lockEth);
      
      if (totalOriginal > 0) {
        const percentUnlocked = ((totalOriginal - currentlyLocked) / totalOriginal) * 100;
        setProgress(Math.min(Math.max(percentUnlocked, 0), 100));
      }

      try {
        const currentChainTime = await contract.currentTime();
        const planData = await contract.plans(vault.planId); 
        
        const startTime = Number(planData[4]);
        const duration = Number(planData[2]);
        const interval = Number(planData[3]);
        const elapsed = Number(currentChainTime) - startTime;

        if (elapsed >= duration) {
          setUnlockTimestamp(null);
          setCountdownText("Fully Unlocked 🎉");
        } else {
          // Calculate the exact millisecond of the next unlock
          const nextUnlockSecs = startTime + (Math.floor(elapsed / interval) + 1) * interval;
          setUnlockTimestamp(nextUnlockSecs * 1000); 
        }
      } catch (dateError) {
        console.error(`Date math failed for Plan #${vault.planId}:`, dateError);
        setCountdownText("Error fetching time");
      }

    } catch (error) {
      console.error(`Error fetching data for Plan #${vault.planId}:`, error);
    }
  };

  // 1. Data Fetcher (Runs every 15 seconds)
  useEffect(() => {
    fetchLiveBalances();
    const interval = setInterval(fetchLiveBalances, 15000);
    return () => clearInterval(interval);
  }, [contract, vault.planId]);

  // 🚀 NEW: 2. Ticking Countdown Clock (Runs every 1 second!)
  useEffect(() => {
    if (!unlockTimestamp) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const distance = unlockTimestamp - now;

      if (distance <= 0) {
        setCountdownText("Ready to Withdraw 🟢");
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      // Pad with leading zeros so it looks like a digital clock (e.g., 04m 09s)
      const h = hours.toString().padStart(2, '0');
      const m = minutes.toString().padStart(2, '0');
      const s = seconds.toString().padStart(2, '0');

      if (days > 0) {
        setCountdownText(`${days}d ${h}h ${m}m ${s}s`);
      } else {
        setCountdownText(`${h}h ${m}m ${s}s`);
      }
    };

    updateTimer(); // Run instantly
    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, [unlockTimestamp]);

const handleWithdraw = async () => {
    if (parseFloat(available) <= 0) return toast.error("No funds available right now!");
    
    setIsProcessing(true);
    const loadingToast = toast.loading("Processing withdrawal...");
    try {
      const tx = await contract.withdraw(vault.planId);
      await tx.wait();

      // 🚀 NEW: Log the withdrawal to the Backend Ledger
      await fetch('https://blockpay-mgu2.onrender.com/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: vault.userWallet,
          vaultName: vault.vaultName,
          txType: 'WITHDRAW',
          amount: available // Logs the exact amount that was just pulled
        })
      });

      toast.success("Success! Funds moved to your wallet.", { id: loadingToast });
      
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10B981', '#3B82F6', '#8B5CF6']
      });

      fetchLiveBalances();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Withdrawal failed", error);
      toast.error("Withdrawal failed.", { id: loadingToast });
    }
    setIsProcessing(false);
  };

  const handleEmergencyUnlock = async () => {
    if (parseFloat(locked) <= 0 && parseFloat(available) <= 0) return toast.error("Vault is empty.");
    
    const confirm = window.confirm("WARNING: Breaking this vault early incurs an 8% penalty. Do you want to proceed?");
    if (!confirm) return;

    setIsProcessing(true);
    const loadingToast = toast.loading("Breaking vault...");
    try {
      const tx = await contract.withdrawEarly(vault.planId);
      await tx.wait();

      // 🚀 NEW: Log the Emergency Break to the Backend Ledger
      await fetch('https://blockpay-mgu2.onrender.com/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userWallet: vault.userWallet,
          vaultName: vault.vaultName,
          txType: 'EMERGENCY',
          amount: locked // Logs the locked amount that was broken
        })
      });

      toast.success("Emergency withdrawal complete.", { id: loadingToast });
      fetchLiveBalances();
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error("Emergency withdrawal failed", error);
      toast.error("Transaction failed.", { id: loadingToast });
    }
    setIsProcessing(false);
  };

  const formatDisplay = (ethString) => {
    const num = parseFloat(ethString);
    if (isNaN(num)) return { value: "0.00", symbol: currency };

    if (currency === 'USD') {
      const usdValue = num * ethPrice.usd;
      return { value: usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), symbol: '$' };
    } else if (currency === 'INR') {
      const inrValue = num * ethPrice.inr;
      return { value: inrValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), symbol: '₹' };
    }
    
    return { value: ethString, symbol: 'ETH' };
  };

  const displayAvailable = formatDisplay(available);
  const displayLocked = formatDisplay(locked);
  const hasFundsReady = parseFloat(available) > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1, type: "spring", stiffness: 100 }}
      className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 hover:border-indigo-500/50 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between group transition-all duration-500"
    >
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full mix-blend-multiply filter blur-3xl transition-colors duration-500 ${hasFundsReady ? 'bg-emerald-500/30' : 'bg-indigo-500/20'}`}></div>
      
      <div>
        <div className="flex justify-between items-start mb-6">
          <h3 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">{vault.vaultName}</h3>
          <span className="text-xs text-slate-600 font-mono bg-slate-950 px-2 py-1 rounded-md">#{vault.planId}</span>
        </div>
        
        <div className="mb-6">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-slate-500">Progress</span>
            <div className="flex items-center gap-3">
              {/* 🚀 NEW: Monospaced ticking clock with a tiny hourglass */}
              <span className="text-cyan-400 font-mono tracking-wider bg-slate-950 px-2 py-1 rounded border border-cyan-900/30 shadow-inner flex items-center gap-1.5">
                {countdownText !== "Fully Unlocked 🎉" && <span className="text-[10px] animate-pulse">⏳</span>}
                {countdownText}
              </span>
              <span className="text-slate-300 font-medium hidden sm:block">{progress.toFixed(1)}%</span>
            </div>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-2.5 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
            <p className="text-sm text-slate-500 mb-1">Available to Withdraw</p>
            <p className={`text-3xl font-bold ${hasFundsReady ? 'text-emerald-400' : 'text-slate-600'}`}>
              {currency !== 'ETH' && <span className="text-2xl mr-1">{displayAvailable.symbol}</span>}
              {displayAvailable.value} 
              {currency === 'ETH' && <span className="text-base opacity-50 ml-2">ETH</span>}
            </p>
          </div>
          
          <div className="px-2">
            <p className="text-sm text-slate-500 mb-1">Locked Future Funds</p>
            <p className="text-lg font-semibold text-slate-300">
              {currency !== 'ETH' && <span className="mr-1 text-slate-500">{displayLocked.symbol}</span>}
              {displayLocked.value} 
              {currency === 'ETH' && <span className="text-sm text-slate-500 ml-1">ETH</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mt-auto relative z-10">
        <button 
          onClick={handleWithdraw}
          disabled={isProcessing || !hasFundsReady}
          className={`w-full font-bold py-3.5 rounded-xl transition-all duration-300 relative ${
            hasFundsReady 
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse hover:animate-none' 
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          {isProcessing ? "Processing..." : "Withdraw Available"}
        </button>
        
        <button 
          onClick={handleEmergencyUnlock}
          disabled={isProcessing}
          className="w-full hover:bg-rose-950/30 border border-transparent hover:border-rose-900/50 text-slate-400 hover:text-rose-400 font-medium py-2 rounded-xl transition-all flex justify-center items-center text-sm gap-2"
        >
          <span>Emergency Break</span>
          <span className="bg-rose-950/50 text-rose-500 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider">8% Fee</span>
        </button>
      </div>
    </motion.div>
  );
}