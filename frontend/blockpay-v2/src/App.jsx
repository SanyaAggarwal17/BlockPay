import { useState, useEffect } from 'react'
import { connectToBlockchain } from './ethereum'
import { ethers } from 'ethers'
import VaultCard from './VaultCard'
import toast, { Toaster } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import Avatar from 'boring-avatars'

function App() {
  // --- EXISTING STATE ---
  const [account, setAccount] = useState(null)
  const [contract, setContract] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const ADMIN_WALLET = "0x6ea...8e21" 
  
  const [vaults, setVaults] = useState([])
  const [vaultName, setVaultName] = useState("")
  const [deposit, setDeposit] = useState("0.01")
  const [duration, setDuration] = useState("30")
  const [interval, setInterval] = useState("7")
  const [isCreating, setIsCreating] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currency, setCurrency] = useState('ETH')
  const [ethPrice, setEthPrice] = useState({ usd: 0, inr: 0 })

  const [transactions, setTransactions] = useState([]);

  // 🚀 NEW: Navigation State
  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' or 'community'
  
  // 🚀 NEW: Real-Time Global Stats State (Ready for your backend)
  const [globalStats, setGlobalStats] = useState({ burnedEth: "0.00", topPercentile: "..." })

  // Fetch ETH Prices
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd,inr')
        const data = await res.json()
        setEthPrice({ usd: data.ethereum.usd, inr: data.ethereum.inr })
      } catch (err) {
        console.error("Failed to fetch ETH price", err)
      }
    }
    fetchPrice()
    const priceInterval = setInterval(fetchPrice, 60000) 
    return () => clearInterval(priceInterval)
  }, [])

  // 🚀 NEW: Fetch Global Stats (Simulated for now, ready for backend)
// 🚀 UPGRADED: Real-Time Global Stats Fetcher
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/stats/global');
        const data = await res.json();
        
        // We calculate a dynamic "Top %" based on user count for extra "Oomph"
        const percentile = data.userCount > 5 ? "Top 5" : "Top 1"; 
        
        setGlobalStats({ 
          burnedEth: data.burnedEth, 
          topPercentile: percentile 
        });
      } catch (err) {
        console.error("Failed to fetch global stats", err);
      }
    }

    fetchStats();
    // Refresh global stats every 30 seconds to keep the "Live" feel
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [activeTab]); // Runs when switching tabs

  const applyTemplate = (type) => {
    if (type === 'allowance') {
      setVaultName("Monthly Allowance 🍕"); setDuration("30"); setInterval("7");
      toast.success("Applied: 30-Day Drip Feed", { icon: '💧' })
    } else if (type === 'bill') {
      setVaultName("Upcoming Rent/Bill 📄"); setDuration("15"); setInterval("15");
      toast.success("Applied: 15-Day Hard Lock", { icon: '🔒' })
    } else if (type === 'savings') {
      setVaultName("Deep Savings Goal 💎"); setDuration("90"); setInterval("90");
      toast.success("Applied: 90-Day Diamond Hands", { icon: '💎' })
    }
  }

  const handleConnect = async () => {
    try {
      const { signer, contract } = await connectToBlockchain()
      const address = await signer.getAddress()
      setAccount(address)
      setContract(contract)
      if (address.toLowerCase() === ADMIN_WALLET.toLowerCase()) setIsAdmin(true)
      fetchUserVaults(address)
      fetchTransactionHistory(address)
    } catch (error) {
      console.error("Connection failed", error)
    }
  }

  // 🚀 NEW: Disconnect Function
  const handleDisconnect = () => {
    setAccount(null);
    setVaults([]); // Clear the vaults from the screen
    toast("Wallet disconnected", { icon: '👋' });
  };

  const fetchUserVaults = async (walletAddress) => {
    try {
      const response = await fetch(`http://localhost:5000/api/vaults/${walletAddress}`)
      const data = await response.json()
      setVaults(data)
    } catch (error) {
      console.error("Error fetching vaults:", error)
    }
  }

  const fetchTransactionHistory = async (walletAddress) => {
    try {
      const response = await fetch(`http://localhost:5000/api/transactions/${walletAddress}`);
      const data = await response.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching history:", error);
    }
  };

  const handleCreatePlan = async (e) => {
    e.preventDefault()
    if (!vaultName) return toast.error("Please give your vault a name!")
    setIsCreating(true)
    const loadingToast = toast.loading("Waiting for MetaMask approval...")
    try {
      const amountInWei = ethers.parseEther(deposit)
      const tx = await contract.createPlan(duration, interval, { value: amountInWei })
      toast.loading("Locking funds... Please wait for confirmation.", { id: loadingToast })
      await tx.wait()
      const latestId = await contract.planCount()
      
      await fetch('http://localhost:5000/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userWallet: account, planId: Number(latestId), vaultName: vaultName, depositAmount: deposit })
      })

      toast.success("Vault successfully secured!", { id: loadingToast })
      setVaultName(""); setDeposit("0.01"); setIsModalOpen(false); fetchUserVaults(account);
    } catch (error) {
      console.error(error)
      toast.error("Transaction failed or rejected.", { id: loadingToast })
    }
    setIsCreating(false)
  }

  const handleTimeTravel = async () => {
    try {
      const tx = await contract.fastForward(7); await tx.wait();
      toast.success("Time traveled 7 days!"); fetchUserVaults(account);
    } catch (error) {}
  }

  const totalLockedEth = vaults.reduce((acc, v) => acc + parseFloat(v.depositAmount), 0);
  
  const formatPortfolioValue = () => {
    if (currency === 'USD') return `$ ${(totalLockedEth * ethPrice.usd).toLocaleString()}`;
    if (currency === 'INR') return `₹ ${(totalLockedEth * ethPrice.inr).toLocaleString('en-IN')}`;
    return `${totalLockedEth.toFixed(4)} ETH`;
  };

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans p-4 md:p-8 relative z-0 overflow-hidden">
      {/* Background Orbs */}
      <div className="fixed inset-0 pointer-events-none z-[-1]">
        <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-900/30 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-cyan-900/20 rounded-full blur-[120px] mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[30%] w-[30vw] h-[30vw] bg-emerald-900/10 rounded-full blur-[100px] mix-blend-screen"></div>
      </div>

      <Toaster position="bottom-right" reverseOrder={false} />
      
      {/* HEADER & NAVIGATION */}
      <header className="max-w-6xl mx-auto mb-12">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            BlockPay
          </h1>
          
          {!account ? (
            <button onClick={handleConnect} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-full font-medium transition-all shadow-lg shadow-indigo-500/30">
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <button onClick={() => setIsModalOpen(true)} className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 px-5 py-2 rounded-full text-sm font-bold transition-all">
                + New Vault
              </button>
              
              <div className="flex items-center gap-2">
                <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 pl-2 pr-4 py-1.5 rounded-full flex items-center gap-3 shadow-lg hidden md:flex cursor-default">
                  <div className="rounded-full overflow-hidden border-2 border-slate-800">
                    <Avatar size={28} name={account} variant="beam" colors={['#10B981', '#3B82F6', '#8B5CF6', '#1E1B4B', '#6366f1']} />
                  </div>
                  <span className="text-sm font-mono font-medium tracking-wider text-cyan-400">
                    {account.substring(0, 6)}...{account.substring(38)}
                  </span>
                </div>
                
                <button 
                  onClick={handleDisconnect}
                  title="Disconnect Wallet"
                  className="bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/50 p-2 rounded-full transition-all flex items-center justify-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {account && (
          <div className="flex gap-2 border-b border-slate-800 pb-px">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === 'dashboard' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              My Vaults
            </button>
            <button 
              onClick={() => setActiveTab('community')}
              className={`px-6 py-3 text-sm font-bold transition-all border-b-2 flex gap-2 items-center ${activeTab === 'community' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              Community Hub <span className="bg-emerald-500/20 text-emerald-500 text-[10px] px-1.5 py-0.5 rounded-full">LIVE</span>
            </button>
          </div>
        )}
      </header>

      {/* 💎 PORTFOLIO SUMMARY BANNER */}
      {account && activeTab === 'dashboard' && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto mb-10 p-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 rounded-3xl shadow-[0_0_30px_rgba(99,102,241,0.2)]"
        >
          <div className="bg-slate-950 rounded-[22px] px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Total Assets Secured</p>
              <h2 className="text-4xl font-black text-white tracking-tighter">
                {formatPortfolioValue()}
              </h2>
            </div>
            
            <div className="flex gap-8 border-l border-slate-800 pl-8 hidden md:flex">
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Active Vaults</p>
                <p className="text-xl font-mono text-indigo-400">{vaults.length}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase mb-1">Current ETH Price</p>
                <p className="text-xl font-mono text-emerald-400">
                  ${ethPrice.usd.toLocaleString()}
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-black hover:bg-indigo-400 hover:text-white px-6 py-3 rounded-2xl font-bold transition-all transform hover:scale-105"
            >
              + Create New Asset Lock
            </button>
          </div>
        </motion.div>
      )}

      {/* LANDING PAGE */}
      {!account && (
        <main className="max-w-6xl mx-auto mt-16 md:mt-24 px-4 relative pb-32 text-center">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-gradient-to-tr from-indigo-500/20 via-emerald-500/10 to-cyan-500/20 rounded-full blur-[120px] -z-10"></div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-8 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/50 border border-slate-700/50 backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono text-slate-300 tracking-wider">V 1.1.0 IS LIVE ON TESTNET</span>
          </motion.div>
          <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="text-6xl md:text-8xl font-extrabold text-white mb-6 tracking-tighter max-w-4xl mx-auto">
            Discipline is Hard.<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-indigo-400">Math is Unbreakable.</span>
          </motion.h2>
          <button onClick={handleConnect} className="mt-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-10 py-4 rounded-full font-bold text-lg transition-all shadow-[0_0_30px_rgba(16,185,129,0.2)]">
            Connect Wallet to Start
          </button>
        </main>
      )}

      {/* 🟢 PAGE 1: MY VAULTS DASHBOARD */}
      {account && activeTab === 'dashboard' && (
        <motion.main initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto pb-20">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
            <h2 className="text-2xl font-semibold text-slate-300">Active Allocations</h2>
            <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex gap-1">
              {['ETH', 'USD', 'INR'].map((curr) => (
                <button key={curr} onClick={() => setCurrency(curr)} className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${currency === curr ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                  {curr}
                </button>
              ))}
            </div>
          </div>
          
          {vaults.length === 0 ? (
            <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-3xl p-16 text-center text-slate-500">
              <p className="text-lg mb-6">You don't have any active savings vaults yet.</p>
              <button onClick={() => setIsModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold transition-all">
                Create Your First Vault
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vaults.map((vault, index) => (
                <VaultCard key={vault._id} vault={vault} index={index} contract={contract} onRefresh={() => fetchUserVaults(account)} currency={currency} ethPrice={ethPrice} />
              ))}
            </div>
          )}

          {/* 📜 THE HISTORY LEDGER (Corrected Placement) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-16 bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 md:p-8"
          >
            <h3 className="text-xl font-bold text-white mb-6">Recent Activity</h3>
            <div className="space-y-3">
              {transactions.length === 0 ? (
                <p className="text-slate-500 text-center py-4 font-mono text-sm">No recent activity recorded on this wallet.</p>
              ) : (
                transactions.map((tx) => (
                  <div key={tx._id} className="flex items-center justify-between bg-slate-950/50 border border-slate-800/50 p-4 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border ${
                        tx.txType === 'DEPOSIT' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                        tx.txType === 'WITHDRAW' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}>
                        {tx.txType === 'DEPOSIT' ? '🔒' : tx.txType === 'WITHDRAW' ? '💧' : '🚨'}
                      </div>
                      <div>
                        <p className="text-slate-200 font-medium">{tx.txType === 'DEPOSIT' ? 'Vault Secured' : tx.txType === 'WITHDRAW' ? 'Withdrawal' : 'Emergency Break'}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{tx.vaultName}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <p className={`font-bold ${tx.txType === 'WITHDRAW' ? 'text-emerald-400' : tx.txType === 'EMERGENCY' ? 'text-rose-400' : 'text-indigo-400'}`}>
                        {tx.txType === 'WITHDRAW' ? '+' : tx.txType === 'EMERGENCY' ? '-' : ''} {tx.amount} ETH
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </motion.main>
      )}

      {/* 🟣 PAGE 2: COMMUNITY HUB (STUNNING UI UPGRADE) */}
      {account && activeTab === 'community' && (
        <motion.main initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="max-w-6xl mx-auto pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            
            {/* 🔥 High-Impact Burn Tracker Card */}
            <div className="bg-rose-950/20 backdrop-blur-xl border border-rose-500/30 rounded-3xl p-8 relative overflow-hidden group hover:shadow-[0_0_50px_rgba(225,29,72,0.2)] transition-all duration-700">
              {/* Animated Glow Effect */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/20 rounded-full blur-[80px] group-hover:bg-rose-500/40 transition-all duration-700"></div>
              
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }} 
                transition={{ repeat: Infinity, duration: 3 }}
                className="text-6xl mb-4 filter drop-shadow-[0_0_15px_rgba(225,29,72,0.5)]"
              >
                🔥
              </motion.div>
              
              <h3 className="text-rose-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-2">Protocol Revenue Burn</h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">Cumulative penalties collected from early vault breaches across the entire platform.</p>
              
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-mono font-black text-white tracking-tighter">
                  {parseFloat(globalStats.burnedEth || 0).toFixed(4)}
                </span>
                <span className="text-xl font-bold text-rose-500">ETH</span>
              </div>
              
              <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-rose-500/60 uppercase tracking-widest">
                 <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                 Live Blockchain Aggregate
              </div>
            </div>

            {/* 👑 High-Impact Ranking Card */}
            <div className="bg-emerald-950/20 backdrop-blur-xl border border-emerald-500/30 rounded-3xl p-8 relative overflow-hidden group hover:shadow-[0_0_50px_rgba(16,185,129,0.15)] transition-all duration-700">
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[80px] group-hover:bg-emerald-500/20 transition-all duration-700"></div>
              
              <div className="text-6xl mb-4">👑</div>
              <h3 className="text-emerald-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-2">Your Discipline Ranking</h3>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed">Based on successfully completed locks without using the emergency break button.</p>
              
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-mono font-black text-white tracking-tighter">
                   {globalStats.topPercentile}
                </span>
                <span className="text-xl font-bold text-emerald-500 text-white opacity-40 italic font-light ml-1">%</span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-[10px] font-mono text-emerald-500/60 uppercase tracking-widest">
                 Top Tier Protocol Citizen
              </div>
            </div>
          </div>
          
          {/* Keep your Platform Updates section below this! */}
        </motion.main>
      )}

      {/* MODAL SECTION */}
      {/* 🟢 FULL FEATURE MODAL: Timing & Cycle Controls */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
            <div className="absolute inset-0" onClick={() => !isCreating && setIsModalOpen(false)}></div>
            <motion.div initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }} className="relative bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl w-full max-w-md z-10 overflow-hidden">
              
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">New Financial Vault</h2>
                <button onClick={() => setIsModalOpen(false)} disabled={isCreating} className="text-slate-500 hover:text-white transition-colors text-xl">✕</button>
              </div>

              {/* 1. Quick Templates for Speed */}
              <div className="mb-6">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3">Discipline Templates</label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => applyTemplate('allowance')} className="bg-slate-950 hover:bg-indigo-900/40 border border-slate-800 hover:border-indigo-500/50 p-3 rounded-2xl text-center transition-all group">
                    <div className="text-xl mb-1 group-hover:scale-110 transition-transform">💧</div>
                    <div className="text-[10px] text-slate-400 font-bold">Drip Feed</div>
                  </button>
                  <button type="button" onClick={() => applyTemplate('bill')} className="bg-slate-950 hover:bg-rose-900/40 border border-slate-800 hover:border-rose-500/50 p-3 rounded-2xl text-center transition-all group">
                    <div className="text-xl mb-1 group-hover:scale-110 transition-transform">🔒</div>
                    <div className="text-[10px] text-slate-400 font-bold">Hard Lock</div>
                  </button>
                  <button type="button" onClick={() => applyTemplate('savings')} className="bg-slate-950 hover:bg-emerald-900/40 border border-slate-800 hover:border-emerald-500/50 p-3 rounded-2xl text-center transition-all group">
                    <div className="text-xl mb-1 group-hover:scale-110 transition-transform">💎</div>
                    <div className="text-[10px] text-slate-400 font-bold">Diamond</div>
                  </button>
                </div>
              </div>
              
              <form onSubmit={handleCreatePlan} className="space-y-5">
                {/* Vault Identity */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Vault Name</label>
                  <input type="text" placeholder="e.g. MacBook Pro" value={vaultName} onChange={(e) => setVaultName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">Initial Deposit (ETH)</label>
                  <input type="number" step="0.001" value={deposit} onChange={(e) => setDeposit(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-3 px-4 text-white focus:ring-2 focus:ring-indigo-500 outline-none font-mono" />
                </div>

                {/* 🚀 THE CORE PRINCIPLE: TIME CONTROLS */}
                <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-2xl border border-slate-800 border-dashed">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Total Days Locked</label>
                    <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-white outline-none text-sm font-mono focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Release Cycle (Days)</label>
                    <input type="number" value={interval} onChange={(e) => setInterval(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-xl py-2 px-3 text-white outline-none text-sm font-mono focus:border-indigo-500" />
                  </div>
                </div>

                {/* The Big Action Button */}
                <button type="submit" disabled={isCreating} className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:from-slate-800 disabled:to-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 active:scale-95">
                  {isCreating ? "Deploying Smart Contract..." : "🚀 SECURE & LOCK FUNDS"}
                </button>
                
                <p className="text-[10px] text-center text-slate-600 font-mono italic">
                  * Funds are locked on-chain. Penalties apply for early withdrawal.
                </p>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App