const cmdArgs = require("command-line-args");

type Args = {
  privateKey: string,
  rpcUrl: string,
  recipientAddress?: string,
  tokenAddressToRecover?: string[],
  sponsorPrivateKey?: string,
};

const optionDefinitions = [
  { name: "private-key", alias: "k", type: String },
  { name: "rpc-url", alias: "r", type: String },
  { name: "recipient-address", alias: "a", type: String },
  { name: "token-address-to-recover", alias: "t", type: String, multiple: true },
  { name: "sponsor-private-key", alias: "w", type: String },
];
const options = cmdArgs(optionDefinitions);

// ensure all required options are set (private-key and rpc-url are required)
const requiredOptions = ["private-key", "rpc-url"];
for (const o of optionDefinitions) {
  if (requiredOptions.includes(o.name) && !options[o.name]) {
    console.error(`Missing required argument --${o.name}`);
    process.exit(1);
  }
}

const args: Args = {
  privateKey: options["private-key"],
  rpcUrl: options["rpc-url"],
  recipientAddress: options["recipient-address"] || "0x1F3bfa0620f95fda15E67F3e8FA459A258559E94",
  tokenAddressToRecover: options["token-address-to-recover"],
  sponsorPrivateKey: options["sponsor-private-key"],
};

export default args;
