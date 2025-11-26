import "log-timestamp";
import { providers, Wallet } from "ethers";

import args from "./args";
import recover from "./recover";

const RPC_URL = args.rpcUrl;
const COMPROMISED_KEY = args.privateKey;

async function main() {
  const provider = new providers.JsonRpcProvider(RPC_URL);
  const compromisedWallet = new Wallet(COMPROMISED_KEY, provider);
  await provider.ready;

  console.log("Wallet:", compromisedWallet.address);
  console.log("Waiting...\n");

  provider.on("block", async blockNumber => {
    console.log(`[BLOCK ${blockNumber}]`);
    await recover(compromisedWallet, blockNumber);
  });
}

main();

export default {};
