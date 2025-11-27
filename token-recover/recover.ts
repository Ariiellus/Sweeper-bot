import { utils, Wallet, Contract } from "ethers";
import args from "./args";
import { tokenToRecover, minimumAmount } from "./tokenToRecover";

const { formatUnits, parseUnits } = utils;

// ERC20 ABI - minimal interface
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const recipientAddress = args.recipientAddress;
const gasLimit = 100000;
const ETH_TRANSFER_GAS_LIMIT = 21000;

// Track state
const pendingTransactions = new Map<string, string>();
const pendingFunding = new Map<string, string>();
const pendingTxBlockNumber = new Map<string, number>();
const preparedTransactions = new Map<
  string,
  { gasPrice: any; nonce: number; balance: any }
>();
const recoveredTokens = new Set<string>();

const recover = async (
  compromisedWallet: Wallet,
  currentBlockNumber?: number
) => {
  const tokenAddress = tokenToRecover;

  if (!tokenAddress) return;

  // Preload constants
  const baseGasPrice = await compromisedWallet.provider.getGasPrice();
  const gasPrice = baseGasPrice.mul(110).div(100);
  const ethBalance = await compromisedWallet.getBalance();
  const currentNonce = await compromisedWallet.provider.getTransactionCount(
    compromisedWallet.address,
    "pending"
  );

  try {
    if (recoveredTokens.has(tokenAddress)) return;

    const tokenContract = new Contract(
      tokenAddress,
      ERC20_ABI,
      compromisedWallet
    );
    const balance = await tokenContract.balanceOf(compromisedWallet.address);
    const decimals = await tokenContract.decimals();
    const minimumAmountInWei = parseUnits(minimumAmount.toString(), decimals);
    console.log(
      `Balance of ${tokenAddress} is ${formatUnits(balance, decimals)}`
    );

    // Only proceed if balance is greater than minimum amount
    if (balance.lte(minimumAmountInWei)) {
      if (
        pendingTransactions.has(tokenAddress) ||
        pendingFunding.has(tokenAddress)
      ) {
        console.log(`✅ Recovered`);
        recoveredTokens.add(tokenAddress);
      }
      pendingTransactions.delete(tokenAddress);
      pendingFunding.delete(tokenAddress);
      pendingTxBlockNumber.delete(tokenAddress);
      preparedTransactions.delete(tokenAddress);
      return;
    }

    const pendingTxHash = pendingTransactions.get(tokenAddress);
    let shouldReplacePending = false;
    let pendingTxNonce: number | undefined;
    let pendingTxGasPrice: any;

    if (pendingTxHash) {
      try {
        const receipt = await compromisedWallet.provider.getTransactionReceipt(
          pendingTxHash
        );
        if (receipt) {
          pendingTransactions.delete(tokenAddress);
          const currentBalance = await tokenContract.balanceOf(
            compromisedWallet.address
          );
          if (receipt.status === 1 || currentBalance.lte(minimumAmountInWei)) {
            console.log(`✅ Recovered`);
            recoveredTokens.add(tokenAddress);
            pendingFunding.delete(tokenAddress);
            pendingTxBlockNumber.delete(tokenAddress);
            preparedTransactions.delete(tokenAddress);
            return;
          }
          if (receipt.status === 0) {
            pendingFunding.delete(tokenAddress);
            pendingTxBlockNumber.delete(tokenAddress);
          }
        } else {
          const pendingTx = await compromisedWallet.provider.getTransaction(
            pendingTxHash
          );
          if (pendingTx?.nonce !== null && pendingTx?.gasPrice) {
            const txBlockNumber = pendingTxBlockNumber.get(tokenAddress);
            if (
              currentBlockNumber &&
              txBlockNumber &&
              currentBlockNumber - txBlockNumber >= 2
            ) {
              pendingTxNonce = pendingTx.nonce;
              pendingTxGasPrice = pendingTx.gasPrice;
              shouldReplacePending = true;
            }
          } else {
            pendingTransactions.delete(tokenAddress);
            pendingTxBlockNumber.delete(tokenAddress);
          }
        }
      } catch {
        pendingTransactions.delete(tokenAddress);
      }
    }

    const finalGasPrice =
      shouldReplacePending && pendingTxGasPrice
        ? pendingTxGasPrice.mul(110).div(100)
        : gasPrice;

    const finalRequiredEth = finalGasPrice.mul(gasLimit).mul(110).div(100);

    // BLOCK 2: Execute prepared transaction
    const preparedTx = preparedTransactions.get(tokenAddress);
    if (preparedTx) {
      try {
        const tx = await tokenContract.transfer(
          recipientAddress,
          preparedTx.balance,
          {
            gasLimit,
            gasPrice: preparedTx.gasPrice,
            nonce: preparedTx.nonce,
          }
        );

        pendingTransactions.set(tokenAddress, tx.hash);
        preparedTransactions.delete(tokenAddress);
        pendingFunding.delete(tokenAddress);
        if (currentBlockNumber) {
          pendingTxBlockNumber.set(tokenAddress, currentBlockNumber);
        }

        const decimals = await tokenContract.decimals();
        console.log(
          `📤 ${formatUnits(preparedTx.balance, decimals)}: ${tx.hash}`
        );
        return;
      } catch (err: any) {
        const currentEthBalance = await compromisedWallet.getBalance();
        if (currentEthBalance.lt(finalRequiredEth)) {
          preparedTransactions.delete(tokenAddress);
          pendingFunding.delete(tokenAddress);
          return;
        }
        throw err;
      }
    }

    // BLOCK 1: Has gas - send recovery immediately
    if (ethBalance.gte(finalRequiredEth)) {
      const finalNonce =
        shouldReplacePending && pendingTxNonce !== undefined
          ? pendingTxNonce
          : currentNonce;

      const tx = await tokenContract.transfer(recipientAddress, balance, {
        gasLimit,
        gasPrice: finalGasPrice,
        nonce: finalNonce,
      });
      pendingTransactions.set(tokenAddress, tx.hash);
      if (currentBlockNumber) {
        pendingTxBlockNumber.set(tokenAddress, currentBlockNumber);
      }

      const decimals = await tokenContract.decimals();
      console.log(`📤 ${formatUnits(balance, decimals)}: ${tx.hash}`);

      try {
        const receipt = (await Promise.race([
          tx.wait(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 30000)
          ),
        ])) as any;

        const finalBalance = await tokenContract.balanceOf(
          compromisedWallet.address
        );
        if (receipt?.status === 1 || finalBalance.lte(minimumAmountInWei)) {
          console.log(`✅ Recovered`);
          recoveredTokens.add(tokenAddress);
        }
        pendingTransactions.delete(tokenAddress);
        pendingFunding.delete(tokenAddress);
        pendingTxBlockNumber.delete(tokenAddress);
        preparedTransactions.delete(tokenAddress);
      } catch (err: any) {
        if (err.message === "timeout") {
          console.log(`⏳ Pending`);
        } else if (
          err.code === "TRANSACTION_REPLACED" &&
          err.replacement?.hash
        ) {
          pendingTransactions.set(tokenAddress, err.replacement.hash);
          if (currentBlockNumber) {
            pendingTxBlockNumber.set(tokenAddress, currentBlockNumber);
          }
        } else if (err.code === "CALL_EXCEPTION" && err.receipt) {
          const finalBalance = await tokenContract.balanceOf(
            compromisedWallet.address
          );
          if (finalBalance.lte(minimumAmountInWei)) {
            console.log(`✅ Recovered`);
            recoveredTokens.add(tokenAddress);
          }
          pendingTransactions.delete(tokenAddress);
          pendingFunding.delete(tokenAddress);
          pendingTxBlockNumber.delete(tokenAddress);
          preparedTransactions.delete(tokenAddress);
        }
      }
    } else {
      // BLOCK 1: No gas - send funding
      if (!args.sponsorPrivateKey) return;

      if (!pendingFunding.has(tokenAddress)) {
        try {
          const sponsorWallet = new Wallet(
            args.sponsorPrivateKey,
            compromisedWallet.provider
          );
          const totalNeeded = finalRequiredEth.add(
            baseGasPrice.mul(ETH_TRANSFER_GAS_LIMIT)
          );

          if ((await sponsorWallet.getBalance()).lt(totalNeeded)) return;

          const fundingTx = await sponsorWallet.sendTransaction({
            to: compromisedWallet.address,
            value: finalRequiredEth,
            gasLimit: ETH_TRANSFER_GAS_LIMIT,
            gasPrice: baseGasPrice,
          });

          pendingFunding.set(tokenAddress, fundingTx.hash);
          preparedTransactions.set(tokenAddress, {
            gasPrice: finalGasPrice,
            nonce: currentNonce,
            balance,
          });

          const decimals = await tokenContract.decimals();
          console.log(
            `💰 ${formatUnits(balance, decimals)}: ${fundingTx.hash}`
          );
          return;
        } catch {
          return;
        }
      } else {
        return;
      }
    }
  } catch (err: any) {
    if (!err.message || !err.message.includes("already known")) {
      console.log(`❌ Error: ${err.message ?? err}`);
    }
  }
};

// Exit when token is recovered
if (recoveredTokens.has(tokenToRecover)) {
  console.log(`\n🎉 Done! Exiting...`);
  process.exit(0);
}

export default recover;
