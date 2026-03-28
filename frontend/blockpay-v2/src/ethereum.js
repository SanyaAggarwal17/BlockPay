import { ethers } from "ethers";
import BlockPayABI from "./BlockPayABI.json";

// Replace this with your actual contract address from Remix
const CONTRACT_ADDRESS = "0xE267ECE8F6a963302dCB3354DCd0f69D3cd9cA3C";

export const connectToBlockchain = async () => {
    // 1. Check if MetaMask is installed
    if (!window.ethereum) {
        alert("Please install MetaMask to use BlockPay!");
        throw new Error("MetaMask is not installed.");
    }

    try {
        // 2. Request account access from the user
        await window.ethereum.request({ method: 'eth_requestAccounts' });

        // 3. Set up the Ethers v6 Provider and Signer
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // 4. Create the Contract instance
        const blockPayContract = new ethers.Contract(CONTRACT_ADDRESS, BlockPayABI, signer);

        return { provider, signer, contract: blockPayContract };
    } catch (error) {
        console.error("Error connecting to Web3:", error);
        throw error;
    }
};