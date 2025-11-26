# Sweeper Bot

This is an example of a sweeper bot commonly used to drain wallets which private keys have been exposed to internet.

The purpose of this bot is to show how it works and for local testing when trying to recover remaining assets from a compromised wallet.

The original repo belongs to [zeroXBrock](https://github.com/zeroXbrock/) member of [Flashbots](https://github.com/flashbots). This is a modified version of the original repo, with the following changes:

- The bot doesn't burn ETH.
- It sends all ETH to a specified address (attacker, in this case my testing wallet).
- The bot doesn't sweep other assets, only gas token.
- It hasn't been tested on mainnet or other networks.

> [!CAUTION]
>
> ⚠️ Review carefully this code before even cloning it. ⚠️

## Installation

```bash
git clone https://github.com/Ariiellus/sweeper-bot.git
cd sweeper-bot
yarn install
```

To initialize the bot run:

```bash
yarn start \
  -k <private-key> \ # private key from compromised wallet
  -r https://eth-mainnet.alchemyapi.io/v2/<key> \ 
  -s <sweeper-address> # OPTIONAL address to receive the ETH, defaults to my testing wallet 0x1F3bfa0620f95fda15E67F3e8FA459A258559E94
```

To recover ERC20 tokens from a compromised wallet, run:

```bash
yarn token-recover \
  -k <private-key> \
  -r https://eth-mainnet.alchemyapi.io/v2/<key> \
  -a <recipient-address> \
  -w <sponsor-private-key> 
  ```